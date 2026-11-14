// Clean-room JS translation of the adventure-mode gameplay from the decomp source
// (scratch/pvz-utf8): Board.cpp (PickZombieWaves/SpawnZombieWave/UpdateZombieSpawning,
// GridToPixel, KillAllZombiesInRadius, mowers, graves), Plant.cpp (gPlantDefs, shooters,
// FindTargetZombie/GetPlantAttackRect, DoSpecial, potato arming), Zombie.cpp
// (ZombieInitialize, PickRandomSpeed, TakeDamage routing, biting, pole vault),
// Projectile.cpp (3.33 px/tick peas, damage table), Coin.cpp (sun/coin values),
// LawnMower.cpp, LawnApp.cpp (award/unlock rules), GameConstants.h (tuning).
// Numbers below mirror the original; approximations are marked V1.
import { Reanimation } from "./reanim.js";
import { LOOP, LOOP_FULL_LAST_FRAME, PLAY_ONCE, PLAY_ONCE_AND_HOLD, PLAY_ONCE_FULL_LAST_FRAME, PLAY_ONCE_FULL_LAST_FRAME_AND_HOLD, RENDER_GROUP_ARMS, RENDER_GROUP_HIDDEN, RENDER_GROUP_NORMAL } from "./enums.js";
import {
  BOARD_W, BOARD_H, SUN_FIRST_DROP, SUN_DROP_RANGE, SUN_DROP_MAX,
  WAVE_FIRST, WAVE_GAP, WAVE_GAP_RANGE, WAVE_PRE_FLAG,
  BG, backgroundForLevel, stageRows, gridToPixelX, gridToPixelY, pixelToGrid, lawnXMin, cellW,
  PLANTS, isShooter, ZOMBIES, zombieAllowedOnLevel, numWaves, awardSeedForLevel,
  fixedBankSize, hasShovel, needsLilypad, chooseSeedsOnLevel, numSeedsInBank,
  packetUpgradeCost,
  dirtRowsForLevel, seedsAvailableFor, hasConveyorBelt, isBowlingLevel, CONVEYOR_SPEED,
  conveyorSeedTable, conveyorPacketX, isWhackLevel, whackBank, isVasebreaker, vaseBank, isStormyNightLevel,
} from "./data.js";

export { BG, backgroundForLevel, stageRows, gridToPixelX, gridToPixelY, lawnXMin, cellW, PLANTS, awardSeedForLevel, fixedBankSize, hasShovel, needsLilypad, chooseSeedsOnLevel, numSeedsInBank, packetUpgradeCost, dirtRowsForLevel, seedsAvailableFor, hasConveyorBelt, isBowlingLevel, conveyorSeedTable, isWhackLevel, whackBank, isVasebreaker, vaseBank, isStormyNightLevel };

// ---- tutorial (Board::UpdateTutorial/SetTutorialState/DisplayAdvice, Board.cpp) ----
// TutorialState values (ConstEnums.h). Only the L1/L2 flows (1-8) are in
// scope; MORESUN (9-12, levels 3-7) and minigame/shovel/zen states are not.
export const TUT = {
  OFF: 0,
  L1_PICK_UP_PEASHOOTER: 1, L1_PLANT_PEASHOOTER: 2, L1_REFRESH_PEASHOOTER: 3, L1_COMPLETED: 4,
  L2_PICK_UP_SUNFLOWER: 5, L2_PLANT_SUNFLOWER: 6, L2_REFRESH_SUNFLOWER: 7, L2_COMPLETED: 8,
  // Wall-nut Bowling shovel tutorial (ConstEnums.h 1179-1182).
  SHOVEL_PICKUP: 15, SHOVEL_DIG: 16, SHOVEL_KEEP_DIGGING: 17, SHOVEL_COMPLETED: 18,
  // Whack-a-Zombie tutorial (ConstEnums.h 1192-1194).
  WHACK_BEFORE_PICK_SEED: 28, WHACK_PICK_SEED: 29, WHACK_COMPLETED: 30,
};
// Advice strings (properties/LawnStrings.txt, exact text). Multi-line entries
// keep their \n; the renderer centers each line like TodDrawStringWrapped.
export const ADVICE_TEXT = {
  CLICK_SEED_PACKET: "Click on a seed packet to pick it up!",
  ENOUGH_SUN: "Excellent! You've collected\nenough for your next plant!",
  CLICK_ON_GRASS: "Click on the grass to plant your seed!",
  CLICK_PEASHOOTER: "Click on the peashooter to plant another one!",
  PLANTED_PEASHOOTER: "Nicely done!",
  ZOMBIE_ONSLAUGHT: "Don't let the zombies reach your house!",
  PLANT_SUNFLOWER1: "Sunflowers are an extremely important plant!",
  PLANT_SUNFLOWER2: "Try to plant at least 3 of them!",
  PLANT_SUNFLOWER3: "Planting at least 3 sunflowers improves your\nchances of surviving a zombie attack!",
  MORE_SUNFLOWERS: "The more sunflowers you have,\nthe faster you can grow plants!",
  CLICK_ON_SUN: "Click on the falling sun to collect it!",
  CLICKED_ON_SUN: "Keep on collecting sun!\nYou'll need it to grow more plants!",
  SEED_REFRESH: "Seeds need time to refresh before planting again",
  CANT_AFFORD_PLANT: "You need more sun to do that!",
  // Shovel tutorial (LawnStrings, exact text).
  CLICK_SHOVEL: "Click on the shovel to pick it up!",
  CLICK_PLANT: "Click on a plant to remove it!",
  KEEP_DIGGING: "Keep digging until your lawn is clear of plants!",
  // Board::DisplayAdviceAgain (Board.cpp:5480) for flag waves.
  HUGE_WAVE: "A HUGE WAVE OF ZOMBIES IS APPROACHING!",
  // Grave rules (Board::CanPlantAt 2782-2812, shown HINT_FAST on a failed
  // plant at 3719/3874): gravebuster only on graves, nothing else on a
  // grave. English = translations of the repo's Chinese LawnStrings
  // ([ADVICE_GRAVEBUSTERS_ON_GRAVES]/[ADVICE_PLANT_NOT_ON_GRAVE]).
  GRAVEBUSTERS_ON_GRAVES: "Grave busters must be planted on graves!",
  PLANT_NOT_ON_GRAVE: "You cannot plant on a grave!",
  // Aquatic planting rule (Board::CanPlantAt 2841-2849, shown HINT_FAST on a
  // failed plant at 3723-3743): lily/tangle/sea plant ONLY in water.
  // Exact LawnStrings-en text ([ADVICE_LILYPAD_ON_WATER] etc.).
  LILYPAD_ON_WATER: "Lily pads can only be planted in water",
  TANGLEKELP_ON_WATER: "Tangle kelp can only be planted in water",
  SEASHROOM_ON_WATER: "Sea-shrooms can only be planted in water",
  // Coffee on a non-sleeping/pending/occupied cell (Board::CanPlantAt
  // 2792-2806 PLANTING_NEEDS_SLEEPING, shown at 3840-3842). Exact
  // LawnStrings-en text ([ADVICE_PLANTING_NEED_SLEEPING]).
  PLANTING_NEED_SLEEPING: "Coffee beans can only be planted on sleeping mushrooms",
  // Roof pot rule (Board::CanPlantAt 2877-2880 + MouseDownWithPlant 3795-3804):
  // nothing but the pot itself plants on bare roof. First-time 5-1 teaches
  // the rule (POT1); later it just says to pot first (POT2).
  PLANT_NEED_POT1: "You can only plant in flower pots",
  PLANT_NEED_POT2: "Plant a flower pot first",
  // Spikeweed ground rule (Board::CanPlantAt 2855-2861 + MouseDownWithPlant
  // 3836-3839): pool squares, roof cells and pots report NEEDS_GROUND.
  PLANTING_NEEDS_GROUND: "Spikeweeds can only be planted on solid ground",
  // Potato-on-lily rule (2905 aHasLilypad -> ONLY_ON_GROUND + 3744-3747, and
  // wet-cell potato -> NOT_ON_WATER + 3827-3830): both show the same hint.
  POTATO_MINE_ON_LILY: "Potato mines can't be planted on lily pads",
  // GridItem::DrawCrater-era planting gate (Board::CanPlantAt 2826 +
  // MouseDownWithPlant 3810-3818): pool craters report CANT_PLANT_THERE.
  PLANT_NOT_ON_CRATER: "You can't plant on craters",
  CANT_PLANT_THERE: "You can't plant there",
  // Vasebreaker (Challenge::ScaryPotterStart/OpenPot, Challenge.cpp):
  // USE_SHOVEL_ON_POTS rides HINT (sticky) at stage start; DESTROY_POTS
  // replaces it HINT_FAST on the first opened pot.
  USE_SHOVEL_ON_POTS: "Click on a vase to see what's inside!",
  DESTROY_POTS: "Destroy all zombies and vases to finish the level!",
};
// Crazy Dave dialogue (LawnStrings [CRAZY_DAVE_*], exact retail text).
export const DAVE_TEXT = {
  // First-time 2-1 night intro (CutScene::StartLevelIntro 746-749:
  // mCrazyDaveDialogStart = 201). English from the repo's LawnStrings-en
  // (the decomp Chinese text carries no tags on 201-207 either — all plain
  // SHORT lines by the TalkMessage char-count thresholds, except 207 which
  // crosses into EXTRA_LONG). {PLAYER_NAME} is substituted at talk time
  // (LawnApp::GetCrazyDaveText 2457-2465).
  201: "Evening, {PLAYER_NAME}.",
  202: "Those zombies just won't let up, will they?",
  203: "You'll notice that fighting zombies at night is different than in the day.",
  204: "For one, you won't get any sun falling from the sky.",
  205: "You can still get sun from sunflowers, though.",
  206: "And lucky for you, you got yourself some puff-shrooms.",
  207: "Plant as many of those as you can and you'll be A-O-GOOD.",
  // Pre-shop seed-slot offers (CutScene::StartLevelIntro 746-761: Dave
  // sells extra slots directly at cash milestones before the shop
  // unlocks). Exact LawnStrings-en text; {MONEY}/{UPGRADE_COST} are
  // substituted at talk time (LawnApp::GetCrazyDaveText 2457-2465), and
  // {NO_CLICK} hides the bubble's "click to continue" (DrawCrazyDave
  // 3029-3033) since the Yes/No dialog continues instead.
  // L12 tease (1401-1402): no purchase, plain advance to leave.
  1401: "Hey, you've collected {MONEY} in coins so far!",
  1402: "When you collect {UPGRADE_COST}, I'll sell you something really neat-o!",
  // First offer (1501-1503): 7 slots for the purchases==0 cost.
  1501: "Hey! Wanna buy an extra seed slot?",
  1502: "It'll cost you {UPGRADE_COST}, but you'll be able to choose 7 seeds per level instead of 6!",
  1503: "{NO_CLICK}How's that sound?",
  // Bought (1510-1511; {UPGRADE_COST} is now the 8-slot cost) / declined (1520).
  1510: "All right! And hey, when you save up to {UPGRADE_COST}, I'll sell you the 8-seed slot upgrade!",
  1511: "Check you later!",
  1520: "Bummer, dude!",
  // Second offer (1551-1553): 8 slots for the purchases==1 cost.
  1551: "Hey! Wanna buy an extra seed slot?",
  1552: "It'll cost you {UPGRADE_COST}, but you'll be able to choose 8 seeds per level instead of 7!",
  1553: "{NO_CLICK}How's that sound?",
  // Bought (1560) / declined (1570).
  1560: "All right!",
  1570: "Bummer, dude!",
  2400: "Greetings, neighbor!",
  2401: "The name's Crazy Dave.",
  2402: "But you can just call me Crazy Dave.",
  2403: "Listen, I've got a surprise for you.",
  2404: "But first, I'll need you to clear your lawn.",
  2405: "Use your shovel and dig up those plants!",
  2406: "LET THE DIGGING COMMENCE!{MOUTH_SMALL_OH} {SCREAM}",
  2410: "Ok goody, now for the surprise...",
  2411: "We're going BOWLING!{MOUTH_SMALL_SMILE}",
  2412: "{SHOW_WALLNUT}HERE, TAKE THIS WALL-NUT!!",
  2413: "Why'd I put a wall-nut in your hand?{MOUTH_SMALL_OH}",
  2414: "{SHAKE}Because I'm CRAAAAZY!!!!!{MOUTH_BIG_SMILE}",
  2415: "NOW GO! BOWL ME A WINNER!{MOUTH_BIG_SMILE} {SCREAM}",
  // Whack-a-Zombie intro (CutScene::StartLevelIntro 779-782:
  // mCrazyDaveDialogStart = 401; LawnStrings [CRAZY_DAVE_401..406], exact).
  401: "Ever play a game called Whack-a-Zombie?",
  402: "It's just like huntin' squirbos.",
  403: "You know, those furry little rodents that dig holes in your lawn?",
  404: "Yeah, just like that, but instead of squirbos, it's zombies.",
  405: "{SHOW_HAMMER}And instead of a shovel, it's a mallet.",
  406: "And instead of ME, it's YOU! {MOUTH_BIG_SMILE} {SCREAM}",
  // Pool intro (CutScene::StartLevelIntro 775-778: mCrazyDaveDialogStart =
  // 501 on first-time adventure L21 only). LawnStrings [CRAZY_DAVE_501..505],
  // exact. Plain lines, advanced 501 -> ... -> 505 -> leave.
  501: "Looks like the zombies gave up attacking your front yard.",
  502: "Now they're trying your backyard.",
  503: "And to top it all off, you can't even use your mushrooms!",
  504: "'cause they'll fall asleep during the day!",
  505: "Well isn't that just dandy!",
  // Vasebreaker intro (CutScene::StartLevelIntro 791-794:
  // mCrazyDaveDialogStart = 2500 on EVERY adventure attempt of L35, NOT
  // first-time gated). LawnStrings [CRAZY_DAVE_2500..2502], exact.
  2500: "Me and my buddy Harvey Flaxcaster used to break vases when we were bored.",
  2501: "Well Harvey's outta town, so you're coming with me, Harvey #2!",
  2502: "BREAK IT LIKE YOU MEAN IT, HARVEY! {SCREAM}",
  // Vasebreaker stage-2 intermission (AdvanceCrazyDaveDialog message 2700).
  2700: "Man, you broke those vases nice and good!",
  2701: "Broke 'em like the time I broke my back digging through those trash cans!",
  2702: "Here, I brought you some more vases.",
  2703: "Gotta be careful about breaking them too fast, though.",
  2704: "You don't wanna end up with more zombies than you can handle, huh huh.",
  // Vasebreaker final-stage intermission (message 2800).
  2800: "All right!",
  2801: "This should be the last of 'em.",
  2802: "Break these, and you'll be all done!",
  // Big Trouble Little Zombie intro (CutScene::StartLevelIntro 783-786:
  // mCrazyDaveDialogStart = 701 on EVERY adventure attempt — unlike the
  // first-time-only offer intros above, 779-786 carry no IsFirstTime check.
  // LawnStrings-en [CRAZY_DAVE_701..703], exact: 701/702 ride the plain
  // word-count SHORT branch (14/5 words), 703 fires the {SCREAM} branch).
  701: "Funny thing about the zombie process. Sometimes it makes 'em come out real little.",
  702: "Real little and REAL MEAN!",
  703: "Defend your shins! {SCREAM}",
  // Custom 5-1 (L41) unfinished-content warning (user request, NOT retail):
  // shown on EVERY adventure attempt of level 41 while the main
  // GENERATORNOTFINISHED flag is true. Plain lines (no tags), advanced
  // like any other Dave dialog (9001 -> 9002 -> 9003 -> leave).
  9001: "Hey, neighbour.",
  9002: "Just so you know, past this point everything isn't fully implemented and working yet.",
  9003: "Expect broken and missing stuff.",
  // Stormy-night intro (CutScene::StartLevelIntro 795-798:
  // mCrazyDaveDialogStart = 1101 on EVERY adventure attempt of L40, NOT
  // first-time gated). LawnStrings [CRAZY_DAVE_1101..1103], exact.
  1101: "Why'd it get so dark all of a sudden?",
  1102: "This can't be good.",
  1103: "Oh well, hope you survive the night!",
  // Crazy Dave's shop (StoreScreen intro + hover + ambient + purchase).
  // English from the DebugVS2005 LawnStrings (retail US); tags preserved
  // verbatim for DrawCrazyDave/TalkMessage ({MOUTH_*}/{SHAKE}/{SCREAM*}/
  // {SHOW_*}/{NO_CLICK}/{NO_SOUND}). 301-304 = key intro, 601-606 = taco
  // intro (602 hands the moneybag, 603 the diamond + taco flag clear),
  // 3100 = late shop intro, 2000-2034 = hover lines, 2015-2018 = ambient,
  // 2601 = fertilizer gift, 3400 = first-aid hint.
  301: "Hey, you found my car key!",
  302: "You know what that means...",
  303: "Crazy Dave's Twiddydinkies is open for business! {MOUTH_SMALL_SMILE}",
  304: "Have a look! See if you can't find something you like! {MOUTH_SMALL_SMILE}",
  601: "YOU FOUND MY MAGIC TACO!! {SCREAM2}",
  602: "{SHOW_MONEYBAG}I must have it! I'll give you $1000!",
  603: "YES!  THE TACO IS MINE! {SCREAM}",
  604: "Why'd I give you so much money for a taco?",
  605: "{SHAKE}BECAUSE I'M CRAAAZY!!!! {MOUTH_BIG_SMILE}",
  606: "Take a look around my shop! You'll notice I got some new items in stock!",
  3100: "Hey neighbor! Got some new items for sale!",
  2000: "{NO_SOUND}{NO_CLICK}Plant these on your repeaters to turn them into gatling peas! Gatling peas shoot four peas at a time!",
  2001: "{NO_SOUND}{NO_CLICK}Plant these on your sunflowers to turn them into twin sunflowers! Twin sunflowers give twice as much sun as a sunflower!",
  2002: "{NO_SOUND}{NO_CLICK}Plant these on your fume-shrooms to turn them into gloom-shrooms! Gloom-shrooms do rapid attacks in a small area!",
  2003: "{NO_SOUND}{NO_CLICK}Plant these on your lily pads to turn them into cattails! Cattails can attack any lane and take down balloon zombies!",
  2004: "{NO_SOUND}{NO_CLICK}Plant these on your melon-pults to turn them into winter melons! Winter melons do heavy damage and slow groups of zombies!",
  2005: "{NO_SOUND}{NO_CLICK}Plant these on your magnet-shrooms to turn them into gold magnets! Gold magnets collect coins and diamonds for you!",
  2006: "{NO_SOUND}{NO_CLICK}Plant these on your spikeweeds to turn them into spikerocks! Spikerocks do twice the damage and are extremely durable!",
  2007: "{NO_SOUND}{NO_CLICK}Plant these on your kernel-pults to turn them into cob cannons! Click on a cob cannon to launch a deadly attack!",
  2008: "{NO_SOUND}{NO_CLICK}This Imitater lets you have two of the same plant during a level!",
  2009: "{NO_SOUND}{NO_CLICK}This extra mower will give you another line of defense after a lawn mower is used!",
  2010: "{NO_SOUND}{NO_CLICK}This Marigold Sprout goes in your Zen Garden! Grow it to full-size, and it'll reward you nicely!",
  2011: "{NO_SOUND}{NO_CLICK}This extra seed slot will let you choose 7 plants per level!",
  2012: "{NO_SOUND}{NO_CLICK}This extra seed slot will let you choose 8 plants per level!",
  2013: "{NO_SOUND}{NO_CLICK}This extra seed slot will let you choose 9 plants per level!",
  2014: "{NO_SOUND}{NO_CLICK}This extra seed slot will let you choose 10 plants per level!",
  2015: "{NO_CLICK}All twiddydinkies are priced to move!!",
  2016: "{NO_CLICK}ACT NOW! I'M CRRRRRAAAZY!! {SCREAM}",
  2017: "{NO_CLICK}Our prices are unbelievable!!!",
  2018: "{NO_CLICK}I eat food off the floor!",
  2019: "{NO_SOUND}{NO_CLICK}The Golden Watering Can lets you water several plants at once!",
  2020: "{NO_SOUND}{NO_CLICK}Your Zen Garden plants need fertilizer to grow!",
  2021: "{NO_SOUND}{NO_CLICK}This Phonograph lets you play music for your Zen Garden plants! It keeps them happy for an entire day!",
  2022: "{NO_SOUND}{NO_CLICK}Zen Garden plants require Bug Spray from time to time! It keeps them happy for an entire day!",
  2023: "{NO_SOUND}{NO_CLICK}The Gardening Glove lets you move your Zen Garden plants around!",
  2024: "{NO_SOUND}{NO_CLICK}You'll need this Wheel Barrow to transport your Zen Garden plants between gardens!",
  2025: "{NO_SOUND}{NO_CLICK}Stinky the Snail helps you pick up coins in your Zen Garden!",
  2026: "{NO_SOUND}{NO_CLICK}These Pool Cleaners add an extra line of defense on levels with a pool!",
  2027: "{NO_SOUND}{NO_CLICK}These Roof Cleaners add an extra line of defense for those difficult roof levels!",
  2028: "{NO_SOUND}{NO_CLICK}This Garden Rake takes out the first zombie that steps on it! It lasts for 3 levels!",
  2029: "{NO_SOUND}{NO_CLICK}This Aquarium Garden is a place you can keep your aquatic Zen Garden plants!",
  2030: "{NO_SOUND}{NO_CLICK}The Tree of Wisdom will tell you valuable tips and secrets if you grow it tall enough!",
  2031: "{NO_SOUND}{NO_CLICK}Purchase some tree food to grow your Tree of Wisdom nice and tall!",
  2032: "{NO_SOUND}{NO_CLICK}This Mushroom Garden is a place you can keep your Zen Garden plants that fall asleep during the day!",
  2033: "{NO_SOUND}{NO_CLICK}Wall-nut First Aid lets you plant fresh new wall-nuts over damaged ones!  Works for tall-nuts and pumpkins too!",
  2034: "{NO_SOUND}{NO_CLICK}Get more levels, more plants, and more zombies in the full version of this game!",
  2601: "{SHOW_FERTILIZER}I'll give you some fertilizer for stopping by!",
  2602: "Take a look around and see if there's anything else you like!",
  3400: "{NO_CLICK}To use Wall-nut First Aid, simply plant a fresh new Wall-nut over the damaged one!",
};
// MessageWidget durations (MessageWidget.cpp SetLabel, ticks at 100Hz):
// timed tutorial/hint styles last 500, HUGE_WAVE lasts 750, STAY styles last
// 10000 (sticky until cleared or replaced), HOUSE_NAME lasts 250 with a
// fade-out (97-99, 407-411). MessageWidget::Update only counts down < 10000.
const ADVICE_DUR = { L1: 500, L1stay: 10000, L2: 500, HINT: 10000, HINT_FAST: 500, HOUSE: 250, HUGE: 750 };

// ---- armor damage stages (Zombie::TakeHelmDamage/TakeShieldDamage) ----
// Helm/shield armor shows 3 visual stages: intact, cracked (below 2/3),
// badly cracked (below 1/3), then the armor drops. Retail swaps the track
// cel via Reanimation::SetImageOverride (CONE2/3, BUCKET2/3, SCREENDOOR2/3,
// PAPER_PAPER2/3, LADDER_1_DAMAGE1/2, FOOTBALL_HELMET2/3, DIGGER_HARDHAT2/3).
// Thresholds use integer division (GetHelmDamageIndex 5705/GetShieldDamageIndex
// 5754), mirrored here with Math.floor. The ladder and the newspaper ARE the
// shield pool for those types (SHIELDTYPE_LADDER/SHIELDTYPE_NEWSPAPER), so
// their stages ride on the ladder/paper pools.
const ARMOR_STAGES = {
  cone:     { pool: "helm",   track: "anim_cone",              stages: ["IMAGE_REANIM_ZOMBIE_CONE2", "IMAGE_REANIM_ZOMBIE_CONE3"] },
  bucket:   { pool: "helm",   track: "anim_bucket",            stages: ["IMAGE_REANIM_ZOMBIE_BUCKET2", "IMAGE_REANIM_ZOMBIE_BUCKET3"] },
  football: { pool: "helm",   track: "zombie_football_helmet", stages: ["IMAGE_REANIM_ZOMBIE_FOOTBALL_HELMET2", "IMAGE_REANIM_ZOMBIE_FOOTBALL_HELMET3"] },
  digger:   { pool: "helm",   track: "Zombie_digger_hardhat",  stages: ["IMAGE_REANIM_ZOMBIE_DIGGER_HARDHAT2", "IMAGE_REANIM_ZOMBIE_DIGGER_HARDHAT3"] },
  door:     { pool: "shield", track: "anim_screendoor",        stages: ["IMAGE_REANIM_ZOMBIE_SCREENDOOR2", "IMAGE_REANIM_ZOMBIE_SCREENDOOR3"] },
  news:     { pool: "paper",  track: "Zombie_paper_paper",     stages: ["IMAGE_REANIM_ZOMBIE_PAPER_PAPER2", "IMAGE_REANIM_ZOMBIE_PAPER_PAPER3"] },
  ladder:   { pool: "ladder", track: "Zombie_ladder_1",        stages: ["IMAGE_REANIM_ZOMBIE_LADDER_1_DAMAGE1", "IMAGE_REANIM_ZOMBIE_LADDER_1_DAMAGE2"] },
};
// Armor tracks for the damage-flash split coat (main.js): these are the held/
// worn pieces (cone, pail, helmet, hardhat, door + its arms, paper, ladder)
// whose light gray/orange art clips to flat white under a full-strength
// additive flash. The body flashes additively at full source grayness; these
// tracks take a blend-toward-white coat instead (user override, see main.js).
export function armorFlashTracks(type) {
  switch (type) {
    case "cone": return ["anim_cone"];
    case "bucket": return ["anim_bucket"];
    case "football": return ["zombie_football_helmet"];
    case "digger": return ["Zombie_digger_hardhat"];
    case "door": return ["anim_screendoor", "Zombie_outerarm_screendoor", "Zombie_innerarm_screendoor"];
    case "news": return ["Zombie_paper_paper"];
    case "ladder": return ["Zombie_ladder_1"];
    default: return [];
  }
}

// ---- tuning (GameConstants.h / source) ----
const PEA_SPEED = 3.33;          // Projectile straight motion, px/tick
const PEA_DMG = 20;              // gProjectileDefinition pea/snow/puff/star
const BITE_TICKS = 4, BITE_DMG = 4; // Zombie.h TICKS_BETWEEN_EATS / DAMAGE_PER_EAT
const SUN_SKY_GAP0 = 425, SUN_SKY_RANGE = 275, SUN_SKY_MAX = 950; // SUN_COUNTDOWN*
const SUN_VAL = { sun: 25, smallsun: 15, bigsun: 50 };
const COIN_VAL = { silver: 1, gold: 5, diamond: 100 };
const CHILL_TICKS = 1000; // snow-pea DAMAGE_FREEZE -> ApplyChill(false) -> 1000 ticks
const BOBSLED_CRASH_TIME = 150; // Zombie::BobsledCrash mPhaseCounter (Zombie.cpp:527F20)
// Damage flags (Zombie::TakeDamage, ConstEnums.h 225-233): bit indices.
const DMG_BYPASS = 1, DMG_HITS_BOTH = 2, DMG_FREEZE = 4, DMG_NOFLASH = 8, DMG_NOLEAVE = 16, DMG_SPIKE = 32;
// MagnetItemType (Plant.h): the flying steal visuals. The magnet-shroom only
// ever holds slot [0] (GetFreeMagnetItem returns &mMagnetItems[0] for
// non-gold); the coin/diamond tail is gold-magnet-only (out of scope).
const MAGNET_NONE = 0;
const MAGNET_PAIL_1 = 1, MAGNET_PAIL_2 = 2, MAGNET_PAIL_3 = 3;
const MAGNET_FOOTBALL_1 = 4, MAGNET_FOOTBALL_2 = 5, MAGNET_FOOTBALL_3 = 6;
const MAGNET_DOOR_1 = 7, MAGNET_DOOR_2 = 8, MAGNET_DOOR_3 = 9;
const MAGNET_POGO_1 = 10, MAGNET_POGO_2 = 11, MAGNET_POGO_3 = 12;
const MAGNET_JACK = 13;
const MAGNET_LADDER_1 = 14, MAGNET_LADDER_2 = 15, MAGNET_LADDER_3 = 16;
const MAGNET_LADDER_PLACED = 17, MAGNET_PICK_AXE = 21;
// MagnetItemType -> [victim reanim def, IMAGE_* key] for the flying steal
// sprite (DrawMagnetItems). Damage-stage variants ride the same slots the
// steal branches pick (PAIL/DOOR n+1, football/ladder explicit keys).
function magnetItemArtSpec(type) {
  if (type >= MAGNET_PAIL_1 && type <= MAGNET_PAIL_1 + 2) return ["Zombie", "IMAGE_REANIM_ZOMBIE_BUCKET" + (type - MAGNET_PAIL_1 + 1)];
  if (type >= MAGNET_FOOTBALL_1 && type <= MAGNET_FOOTBALL_1 + 2) return ["Zombie_football", ["IMAGE_REANIM_ZOMBIE_FOOTBALL_HELMET", "IMAGE_REANIM_ZOMBIE_FOOTBALL_HELMET2", "IMAGE_REANIM_ZOMBIE_FOOTBALL_HELMET3"][type - MAGNET_FOOTBALL_1]];
  if (type >= MAGNET_DOOR_1 && type <= MAGNET_DOOR_1 + 2) return ["Zombie", "IMAGE_REANIM_ZOMBIE_SCREENDOOR" + (type - MAGNET_DOOR_1 + 1)];
  if (type >= MAGNET_POGO_1 && type <= MAGNET_POGO_1 + 2) return null; // retail draws IMAGE_ZOMBIEPOGO cels here (retail-only art, absent from the user files) — the port flies the victim's own posed stick composite instead (magnetAttract), so there is no static def/key to rebuild from on load (loadSaveData falls back to null; the steal itself persists via the zombie fields)
  if (type === MAGNET_JACK) return ["Zombie_jackbox", "IMAGE_REANIM_ZOMBIE_JACKBOX_BOX"];
  if (type >= MAGNET_LADDER_1 && type <= MAGNET_LADDER_1 + 2) return ["Zombie_ladder", ["IMAGE_REANIM_ZOMBIE_LADDER_1", "IMAGE_REANIM_ZOMBIE_LADDER_1_DAMAGE1", "IMAGE_REANIM_ZOMBIE_LADDER_1_DAMAGE2"][type - MAGNET_LADDER_1]];
  if (type === MAGNET_PICK_AXE) return ["Zombie_digger", "IMAGE_REANIM_ZOMBIE_DIGGER_PICKAXE"];
  return null;
}
// Damage-range flags (Plant::GetDamageRangeFlags / Zombie::EffectedByDamage,
// ConstEnums.h 234-244): bit indices.
const DR_GROUND = 1, DR_FLYING = 2, DR_SUBMERGED = 4, DR_DOG = 8, DR_OFFGROUND = 16, DR_DYING = 32, DR_UNDERGROUND = 64, DR_MIND = 128;
// Board::GetRectOverlap (Board.cpp:9178): HORIZONTAL overlap only (Y never
// matters). Edge-touching counts as 0 (a valid hit for projectiles).
function getRectOverlap(ax, aw, bx, bw) {
  let xmax, rmin, rmax;
  if (ax < bx) { rmin = ax + aw; rmax = bx + bw; xmax = bx; }
  else { rmin = bx + bw; rmax = ax + aw; xmax = ax; }
  if (rmin > xmax && rmin > rmax) rmin = rmax;
  return rmin - xmax;
}
// TodCurveEvaluate(CURVE_EASE_IN_OUT) (TodCommon.cpp): S(S(t)) with the
// smoothstep S(t) = 3t^2-2t^3, clamped to [0,1] like
// TodCurveEvaluateClamped. TodAnimateCurve(50,20,cd,...) maps cd 50->0 and
// cd<=20->1 through this — used by the squash leap (UpdateSquash 1518).
function easeInOut(t) {
  t = Math.max(0, Math.min(1, t));
  const s = t * t * (3 - 2 * t);
  return s * s * (3 - 2 * s);
}
// TodAnimateCurveFloat (TodCommon.cpp): warped=(age-t0)/(t1-t0), clamped to
// [0,1] like TodCurveEvaluateClamped (<=0 -> v0, >=1 -> v1), then the curve.
// Only the curves used by the fog offset path are modeled: CURVE_LINEAR (t)
// and CURVE_EASE_OUT (TodCurveInvQuad: 2t-t^2).
function todAnimateCurveFloat(t0, t1, age, v0, v1, curve = "linear") {
  let k = (age - t0) / (t1 - t0);
  k = Math.max(0, Math.min(1, k));
  if (curve === "easeOut") k = 2 * k - k * k;
  else if (curve === "easeIn") k = k * k;
  return v0 + (v1 - v0) * k;
}
// Zombie::TodAnimateCurve int wrapper (TodCommon.cpp:511C40): FloatRoundToInt of the float curve.
function todAnimateCurve(t0, t1, age, v0, v1, curve = "linear") {
  return Math.round(todAnimateCurveFloat(t0, t1, age, v0, v1, curve));
}
// Zombie::GetCircleRectOverlap (SexyAppFramework/Statics.cpp): circle-vs-rect
// test used by the scaredy proximity scan (Plant.cpp:1324 — center
// (mX, mY+20), radius 120, vs the zombie rect). Same math as the hammer
// hit-test in main.js.
function circleRectOverlap(cx, cy, r, rect) {
  let dx = 0, dy = 0, xOut = false, yOut = false;
  if (cx < rect.x) { xOut = true; dx = rect.x - cx; }
  else if (cx > rect.x + rect.w) { xOut = true; dx = cx - rect.x - rect.w; }
  if (cy < rect.y) { yOut = true; dy = rect.y - cy; }
  else if (cy > rect.y + rect.h) { yOut = true; dy = cy - rect.y - rect.h; }
  if (!xOut && !yOut) return true;
  if (xOut && yOut) return dx * dx + dy * dy <= r * r;
  if (xOut) return dx <= r;
  return dy <= r;
}
const POTATO_ARM = 1500;         // Plant.cpp STATE_NOTREADY countdown
const CHERRY_FUSE = 100, CHERRY_RADIUS = 115;
const POTATO_RADIUS = 60;
const DOOM_RADIUS = 250;
// Cherry/explode-o-nut blast visual (Plant::DoSpecial cherry 4354-4366 +
// bowling explode-o-nut 2424-2436): BOTH spawn PARTICLE_POWIE at
// RENDER_LAYER_TOP — never a white flash circle (that was an invented
// stand-in). Powie.xml (SexyAppFramework/particles/, raw text in the
// decomp) defines 3 emitters, ported literally below: 14 small orange
// puffs + 14 big orange puffs (IMAGE_EXPLOSIONCLOUD, 80x80, main.zip
// particles/ExplosionCloud.png) + 1 static POW word (IMAGE_EXPLOSIONPOWIE,
// main.zip particles/Pow.png 136x123 — the repo's ExplosionPowie.png is the
// Chinese-localized "碰!" and is NEVER shipped; scratch/ only).
// Track syntax (verified against SnowPeaSplat.xml + the shipped snow-splat
// model): space-separated value[,time] tokens, time in PERCENT (0-100),
// first token defaults t=0, trailing bare token t=100; [a b] = per-spawn
// uniform range rolled with the mote's own random interp (TodParticle
// mParticleInterp, one Rand(1) per track per particle). Eval clamps outside
// then lerps (FloatTrackEvaluate, curves unmodeled — Powie uses none).
function parsePowieTrack(str) {
  // Tokens may contain spaces inside [a b] ranges — match bracket groups whole.
  const toks = str.trim().match(/\[[^\]]*\](?:,[^,\s]+)?|[^\s,]+(?:,[^,\s]+)?/g) || [];
  const nodes = toks.map((tok) => {
    let val = tok, time = null;
    const ci = tok.lastIndexOf(",");
    if (ci >= 0) { val = tok.slice(0, ci); time = parseFloat(tok.slice(ci + 1)) / 100; }
    let lo, hi;
    const m = val.match(/^\[(.+?)\]$/);
    // Bracket ranges may carry a curve keyword between the numbers (e.g.
    // PoolSparkly's "[0 FastInOutWeak 290]") — TodParticle curve, unmodeled
    // here (all main.zip water tracks evaluate uniform); keep the numbers.
    if (m) { const p = m[1].trim().split(/\s+/).map(Number).filter((n) => Number.isFinite(n)); lo = p[0]; hi = p.length > 1 ? p[p.length - 1] : p[0]; }
    else lo = hi = parseFloat(val);
    return { t: time, lo, hi };
  });
  if (nodes.length === 1 && nodes[0].t === null) nodes[0].t = 0;
  else {
    if (nodes[0].t === null) nodes[0].t = 0;
    if (nodes[nodes.length - 1].t === null) nodes[nodes.length - 1].t = 1;
    let run = [];
    const flush = (endT) => {
      const startT = nodes[run[0] - 1].t;
      run.forEach((idx, k) => { nodes[idx].t = startT + (endT - startT) * ((k + 1) / (run.length + 1)); });
      run = [];
    };
    for (let i = 1; i < nodes.length - 1; i++) {
      if (nodes[i].t === null) run.push(i);
      else if (run.length) { flush(nodes[i].t); }
    }
    if (run.length) flush(1);
  }
  nodes.sort((a, b) => a.t - b.t);
  return nodes;
}
export function evalPowieTrack(nodes, t, interp) {
  if (!nodes || !nodes.length) return 0; // unset track (FloatTrackIsSet false)
  const at = (n) => n.lo + (n.hi - n.lo) * interp;
  if (t <= nodes[0].t) return at(nodes[0]);
  for (let i = 1; i < nodes.length; i++) {
    if (t <= nodes[i].t) {
      const a = nodes[i - 1], b = nodes[i], f = (t - a.t) / ((b.t - a.t) || 1);
      const lo = a.lo + (b.lo - a.lo) * f, hi = a.hi + (b.hi - a.hi) * f;
      return lo + (hi - lo) * interp;
    }
  }
  return at(nodes[nodes.length - 1]);
}
const POWIE_DEFS = [
  { name: "PowieSmallClouds", img: "cloud", randSpin: true,
    rate: "150", maxLaunched: "14", sysDur: "200",
    dur: "[40 60]", radius: "[10 50]", speed: "[2000 2500]",
    pScale: ".5,60 0", pAlpha: "1,70 0", pRed: "1", pGreen: ".7 0", pBlue: "0",
    sysAlpha: "1,80 0", fric: "0.15,40 1", spin: "[-200 200]" },
  { name: "PowieBigClouds", img: "cloud", randSpin: true,
    rate: "150", maxLaunched: "14", sysDur: "200",
    dur: "[40 60]", radius: "[10 50]", speed: "[500 1200]",
    pScale: "[1.2 1.6],60 0", pAlpha: "1,70 0", pRed: "1", pGreen: ".9 .4", pBlue: "0",
    sysAlpha: "1,80 0", fric: "0.12,40 1", spin: "[-200 200]" },
  { name: "PowieWord", img: "word", randSpin: false, minActive: "1", sysDur: "50" },
];
for (const d of POWIE_DEFS) {
  for (const k of ["sysDur", "rate", "minActive", "maxActive", "maxLaunched", "dur", "radius", "speed",
    "pScale", "pAlpha", "pRed", "pGreen", "pBlue", "sysAlpha", "fric", "spin"])
    d[k + "N"] = d[k] === undefined ? null : parsePowieTrack(d[k]);
}
// Doom-shroom blast (PARTICLE_DOOM, Plant::DoSpecial 4367-4375,
// RENDER_LAYER_TOP): all 11 emitters of main.zip's
// compiled/particles/Doom.xml.compiled (0xDEADFED4+zlib container, decoded
// end==len byte-exact; values identical to the decomp's raw Doom.xml, but the
// compiled main.zip file is the authority — NO repo art anywhere in this
// path: particles/Doom*.png + Doom.png + crater + sounds + plant atlas are
// all byte-identical main.zip files, verified by hash): the Stem
// (1 mote, scale 1.15->.9, stretch .6->1, offsetY -75, Position Y 35->15,
// Shake 2->0), the Base (1 mote, offset (-4,10), Shake 2->0, AnimationRate 5
// over ImageFrames 3), 7 mushroom-cap TOP motes (UnderCap 8x Box[-70,70]x
// [0,10] brightness .7-1 scale .3-.4 sysPos (0,-60) posY 0->-130 spin
// 200-300; Left/Right 2x Circle r[1,20]/[1,30] brightness .3-.6 scale
// .5-.6 sysPos (∓90,-120) posY 0->-60 spin +/-(200-300); CenterLeft/Right 2x
// r[1,30]/[1,20] scale .6-.7 sysPos (∓40,-140); TopCenter 2x r[0,10] scale
// .6-.8 sysPos (0,-160) spin 100-200; MiddleCenter 1x scale .6-.8 sysPos
// (0,-100) spin -(100-200); all dur 150, alpha hold-to-90%-then-fade),
// the Word (1 mote, dur 150, alpha hold-to-80%, offsetY -20, Shake 2), and
// the Flash (1 mote, dur 50, fullscreen WHITEPIXEL rect, colors r 1->.6 /
// g 1->0 / b 1->.4, alpha 1->0). SystemDuration 400 everywhere (one-shot:
// minActive spawns everything on tick 1, motes die by their own dur, the
// system is swept at sysDur = DeleteNonCrossFading). LaunchSpeed is 0 on
// every emitter (no ballistic motion — Position drift + Shake only).
// SystemPosition tracks are all CONSTANTS (the one first-tick jump, see
// spawnDoom), so they bake into the spawn center exactly.
const DOOM_DEFS = [
  { name: "DoomStem", img: "stem", minActive: "1", maxLaunched: "1",
    dur: "150", sysDur: "400", pAlpha: "1,90 0", pScale: "1.15 .9", pStretch: ".6 1",
    offX: "0", offY: "-75", posY: "35 15", shakeX: "2 0", shakeY: "2 0" },
  { name: "DoomBase", img: "base", minActive: "1", maxLaunched: "1",
    dur: "150", sysDur: "400", pAlpha: "1,90 0", animRate: "5", frames: 3,
    offX: "-4", offY: "10", shakeX: "2 0", shakeY: "2 0" },
  { name: "DoomMushroomUnderCap", img: "top", type: "box", randSpin: true,
    minActive: "8", maxLaunched: "8", dur: "150", sysDur: "400",
    bright: "[.7 1]", pAlpha: "1,90 0", pScale: "[.3 0.4]",
    boxX: "[-70 70]", boxY: "[0 10]", posY: "0 -130",
    sysX: "0", sysY: "-60", spin: "[200 300]" },
  { name: "DoomMushroomLeft", img: "top", type: "circle", randSpin: true,
    minActive: "2", maxLaunched: "2", dur: "150", sysDur: "400",
    bright: "[.3 0.6]", pAlpha: "1,90 0", pScale: "[.5 0.6]",
    radius: "[1 20]", posY: "0 -60",
    sysX: "-90", sysY: "-120", spin: "[200 300]" },
  { name: "DoomMushroomRight", img: "top", type: "circle", randSpin: true,
    minActive: "2", maxLaunched: "2", dur: "150", sysDur: "400",
    bright: "[.3 0.6]", pAlpha: "1,90 0", pScale: "[.5 0.6]",
    radius: "[1 30]", posY: "0 -60",
    sysX: "90", sysY: "-120", spin: "[-200 -300]" },
  { name: "DoomMushroomCenterLeft", img: "top", type: "circle", randSpin: true,
    minActive: "2", maxLaunched: "2", dur: "150", sysDur: "400",
    bright: "[.3 0.6]", pAlpha: "1,90 0", pScale: "[.6 0.7]",
    radius: "[1 30]", posY: "0 -60",
    sysX: "-40", sysY: "-140", spin: "[200 300]" },
  { name: "DoomMushroomCenterRight", img: "top", type: "circle", randSpin: true,
    minActive: "2", maxLaunched: "2", dur: "150", sysDur: "400",
    bright: "[.3 0.6]", pAlpha: "1,90 0", pScale: "[.6 0.7]",
    radius: "[1 20]", posY: "0 -60",
    sysX: "40", sysY: "-140", spin: "[-200 -300]" },
  { name: "DoomMushroomTopCenter", img: "top", type: "circle", randSpin: true,
    minActive: "2", maxLaunched: "2", dur: "150", sysDur: "400",
    bright: "[.3 0.6]", pAlpha: "1,90 0", pScale: "[.6 0.8]",
    radius: "[0 10]", posY: "0 -60",
    sysX: "0", sysY: "-160", spin: "[100 200]" },
  { name: "DoomMushroomMiddleCenter", img: "top", type: "circle", randSpin: true,
    minActive: "1", maxLaunched: "1", dur: "150", sysDur: "400",
    bright: "[.3 0.6]", pAlpha: "1,90 0", pScale: "[.6 0.8]",
    radius: "[0 10]", posY: "0 -60",
    sysX: "0", sysY: "-100", spin: "[-100 -200]" },
  { name: "DoomWord", img: "word", minActive: "1", maxLaunched: "1",
    dur: "150", sysDur: "400", pAlpha: "1,80 0",
    offX: "0", offY: "-20", shakeX: "2", shakeY: "2" },
  { name: "DoomFlash", img: "flash", minActive: "1", maxLaunched: "1",
    dur: "50", sysDur: "400", pAlpha: "1 0",
    pRed: "1 .6", pGreen: "1 0", pBlue: "1 .4" },
];
for (const d of DOOM_DEFS) {
  for (const k of ["sysDur", "rate", "minActive", "maxActive", "maxLaunched", "dur",
    "radius", "boxX", "boxY", "offX", "offY", "posX", "posY", "sysX", "sysY",
    "pScale", "pStretch", "pAlpha", "pRed", "pGreen", "pBlue", "bright",
    "shakeX", "shakeY", "spin", "animRate"])
    d[k + "N"] = d[k] === undefined ? null : parsePowieTrack(d[k]);
}
// Ice-shroom fx (PARTICLE_ICE_TRAP at the detonation + PARTICLE_ICE_TRAP_
// RELEASE on thaw/frozen-death, both RENDER_LAYER_TOP): exact retail
// compiled/particles/IceTrap.xml + IceTrapRelease.xml from main.zip
// (0xDEADFED4+zlib containers, same family as the decoded Doom.xml — field
// values below match the decomp's raw IceTrap.xml/IceTrapRelease.xml 1:1).
// Detonation: one FullScreen IceFlash mote (20x20 WHITEPIXEL drawn as a
// fullscreen rect, dur 30, alpha .5->0, cold .5/1/1 tint — the old swelling
// square at the plant was the reported teal-square bug) plus 40 SNOWFLAKES
// motes out on tick 1 (Circle r[0 200], constant LaunchSpeed 200, dur 40,
// scale ".3,0 [.4 1.5],10 [.4 1.5],70 0,100", alpha "1 [.4 .8],80 0",
// gravity 5, random launch spin ±600). Release: [5 10] ICE_TRAP_PARTICLES
// shard motes out on tick 1 (Box [-20 0]x[-70 -10], LaunchSpeed [100 150],
// dur 50, same scale/alpha curves, gravity ramping 0->15 by 40% life,
// random launch spin ±600). All art byte-identical main.zip files
// (particles/SnowFlakes.png 3 cels, images/icetrap_particles.png 4 shard
// cels cropped per ICE_SHARDS below); counters, layers and sounds (FOLEY_
// FROZEN, no thaw/death sound in source) are source-exact. SystemDuration
// is unset on the release emitter in the XML, so the system sweeps at 60
// (all motes dead by 50 — documented stand-in, same DeleteNonCrossFading
// shape as every other system here).
// ICE_SHARDS: exact opaque [x, w] bounds of the 4 shard cels in the 67x17
// IceTrapParticles sheet (measured live; h = 17 for all; ImageFrames 4).
const ICE_SHARDS = [[2, 12], [18, 15], [36, 13], [51, 14]];
// Ambient pool sparkles (PARTICLE_POOL_SPARKLY, Board::Update 5922-5926):
// the looping system at (450,295) on BACKGROUND_3_POOL day-pool stages
// (fog/night pool gets water but no sparkles — the 5922 gate is ==3 only).
// Decoded from the decomp's raw SexyAppFramework/particles/PoolSparkly.xml
// (main.zip's compiled PoolSparkly.xml.compiled is the same definition
// family): emitter 1 = dense fine shimmer (rate 150/s, dur [20 80], box
// [0 290]x[0 135] with skewX -.3), emitter 2 = sparse wide glints (rate
// 20/s, dur [20 60], box [-330 260]x[0 135]). Both: IMAGE_POOLSPARKLY glow,
// scale pulse [.3 .6] -> [.4 .8] @10/20% -> [.5 1] @50% -> [.4 .8] @90/80% ->
// [.3 .6], constant alpha .8, SystemLoops (emit forever), velocity-field
// drift (units are px/s at 100tps, hence /100 per tick: gentle leftward).
const POOL_SPARKLY = [
  { rate: 150, dur: [20, 80], boxX: [0, 290], boxY: [0, 135], skewX: -0.3,
    velX: [-10, 0], velY: [-2, 2],
    scale: "[.3 .6] [.4 .8],10 [.5 1],50 [.4 .8],90 [.3 .6]" },
  { rate: 20, dur: [20, 60], boxX: [-330, 260], boxY: [0, 135], skewX: 0,
    velX: [-5, 0], velY: [-2, 2],
    scale: "[.3 .6] [.4 .8],10 [.5 1],50 [.4 .8],80 [.3 .6]" },
];
for (const d of POOL_SPARKLY) d.scaleN = parsePowieTrack(d.scale);
const ICE_DET_DEFS = [
  { name: "IceFlash", img: "flash", full: true, minActive: "1", maxLaunched: "1",
    dur: "30", sysDur: "30", pAlpha: ".5 0",
    pRed: ".5", pGreen: "1", pBlue: "1" },
  { name: "IceTrap", img: "flakes", type: "circle", randSpin: true,
    minActive: "40", dur: "40", sysDur: "40",
    radius: "[0 200]", speed: "[200]",
    pScale: ".3,0 [.4 1.5],10 [.4 1.5],70 0,100", pAlpha: "1 [.4 .8],80 0",
    grav: "5", spin: "[-600 600]" },
];
const ICE_RELEASE_DEFS = [
  { name: "IceTrapRelease", img: "shards", type: "box", randSpin: true,
    minActive: "[5 10]", dur: "50", sysDur: "60",
    boxX: "[-20 0]", boxY: "[-70 -10]", speed: "[100 150]",
    pScale: ".3,0 [.4 1.5],10 [.4 1.5],70 0,100", pAlpha: "1 [.4 .8],80 0",
    grav: "0 15,40", spin: "[-600 600]" },
];
for (const d of [...ICE_DET_DEFS, ...ICE_RELEASE_DEFS]) {
  for (const k of ["sysDur", "rate", "minActive", "maxActive", "maxLaunched", "dur",
    "radius", "boxX", "boxY", "speed", "pScale", "pAlpha", "pRed", "pGreen", "pBlue",
    "fric", "grav", "spin"])
    d[k + "N"] = d[k] === undefined ? null : parsePowieTrack(d[k]);
}
// Zamboni particle systems (decoded byte-exact from main.zip's
// compiled/particles/*.xml.compiled: zlib + DefMap fixups, end==total — see
// scratch/particle-decode.json + scratch/particle-summary.txt). Field tracks
// map to the TodParticleFieldType enum (TodParticle.h): ft 1 = FRICTION
// (vel *= 1-x / 1-y, x0.01-implied), ft 2 = ACCELERATION (vel += 0.01*x/y),
// ft 6 = POSITION (pos += cur - last, last = 0 on the first tick), ft 11 =
// AWAY (pos += normalize(pos-center)*0.01*(x + radius*y)). ImageFrames pick a
// static random cel at spawn (no AnimationRate on any zam emitter):
// smoke = ZamboniSmoke.png 3 cels of 26x22, dirt = dirtsmall.png top row
// (8 frames; the port sheet stacks a second row the retail image lacks —
// frames 0-7 only), cloud = ExplosionCloud.png, damage1 = the grafted atlas
// cel IMAGE_REANIM_ZOMBIE_ZAMBONI_1_DAMAGE1, zomboss = Zomboss_particles.png
// 5 cels of 69x80, wheel/brush = grafted atlas cels, sparkle =
// IceSparkle.png 3 cels of 20x20. Flags (struct +36): smoke[0] = 41
// (RANDOM_LAUNCH_SPIN | SYSTEM_LOOPS | DONT_FOLLOW — the stage-2/dying stack
// smoke loops until the machine is gone), tire = [1, 33], explosions =
// [1,0,0,0,0,1] (one-shot sysDur 200), sparkle = 40 (loops; UpdateIce kills
// it at timer 0). CatapultExplosion decodes the same way but ships no art
// path in this port (the catapult death is unmodeled) — defs omitted.
const ZAM_SMOKE_DEFS = [
  { name: "ZamboniSmoke0", img: "smoke", flags: 41, sysDur: "20", rate: "30", radius: "[0 4]", dur: "[40 60]", speed: "10", pAlpha: "1 [0.4 0.8],80 0,100", spin: "[-800 800] 0,100", pScale: "0.3 [0.5 0.8],20 [0.8 1],60 0,100", gravY: "-1", posX: "0 30,100", posY: "0 -20,100" },
];
const ZAM_TIRE_DEFS = [
  { name: "Rocks", img: "dirt", flags: 1, sysDur: "500", minActive: "10 0,5", radius: "[0 10]", dur: "[30 40]", speed: "[50 200]", angle: "[140 220]", pAlpha: "1,70 0,100", sysAlpha: "1,92 0,100", spin: "[-720 720]", pScale: "[0.5 0.6]", gravY: "5" },
  { name: "ZamboniTire1", img: "smoke", flags: 33, minActive: "[6 10] 0,50", radius: "[0 10]", dur: "[40 60]", pAlpha: "1,50 0,100", spin: "[-100 100] 0,50", pScale: "0 1.5,10 [1 2],100", awayX: "[20 80] 0,100" },
];
const ZAM_EXPLOSION_DEFS = [
  { name: "ZamboniSmallClouds", img: "cloud", flags: 1, sysDur: "200", rate: "150", maxLaunched: "14", radius: "[10 50]", dur: "[40 60]", speed: "[2000 2500]", pRed: "0.5 0.25,50 0,100", pGreen: "0.8 0.4,50 0,100", pBlue: "1 0.75,50 0,100", pAlpha: "1,70 0,100", sysAlpha: "1,80 0,100", spin: "[-200 200]", pScale: "0.5,60 0,100", fricX: "0.15,40 1,100", fricY: "0.18,40 1,100" },
  { name: "Hood", img: "damage1", flags: 0, minActive: "1", dur: "80", speed: "600", angle: "[150 170]", sysAlpha: "1,90 0,100", spin: "[-720 720] 0,100", pScale: "0.8", gravY: "11" },
  { name: "Parts", img: "zomboss", flags: 0, minActive: "0 6,10", boxX: "[-35 35]", boxY: "30", dur: "80", speed: "[600 800]", angle: "[130 200]", sysAlpha: "1,90 0,100", spin: "[-720 720] 0,100", pScale: "[0.4 0.6]", gravY: "13" },
  { name: "Wheels", img: "wheel", flags: 0, minActive: "0 2,10", boxX: "[-35 35]", boxY: "30", dur: "80", speed: "800", angle: "[130 200]", sysAlpha: "1,90 0,100", spin: "[-720 720] 0,100", pScale: "0.8", gravY: "13" },
  { name: "Beenie", img: "brush", flags: 0, minActive: "0 1,10", dur: "80", speed: "800", angle: "[130 200]", sysAlpha: "1,90 0,100", spin: "[-720 720] 0,100", pScale: "0.8", gravY: "13" },
  { name: "ZamboniBigClouds", img: "cloud", flags: 1, sysDur: "200", rate: "150", maxLaunched: "14", radius: "[10 50]", dur: "[40 60]", speed: "[500 1200]", pRed: "0.5 0.25,50 0,100", pGreen: "0.8 0.4,50 0,100", pBlue: "1 0.75,50 0,100", pAlpha: "1,70 0,100", sysAlpha: "1,80 0,100", spin: "[-200 200]", pScale: "0.5,60 0,100", fricX: "0.12,40 1,100", fricY: "0.18,40 1,100" },
];
const ZAM_EXPLOSION2_DEFS = [
  { name: "ZamboniSmallClouds", img: "cloud", flags: 1, sysDur: "200", rate: "150", maxLaunched: "14", radius: "[10 50]", offX: "100", dur: "[40 60]", speed: "[2000 2500]", pRed: "0.5 0.25,50 0,100", pGreen: "0.8 0.4,50 0,100", pBlue: "1 0.75,50 0,100", pAlpha: "1,70 0,100", sysAlpha: "1,80 0,100", spin: "[-200 200]", pScale: "0.5,60 0,100", fricX: "0.15,40 1,100", fricY: "0.18,40 1,100" },
  { name: "Hood", img: "damage1", flags: 0, minActive: "1", offX: "100", dur: "80", speed: "600", angle: "[150 170]", sysAlpha: "1,90 0,100", spin: "[-720 -300] 0,100", spinA: "270", pScale: "0.8", gravY: "11" },
  { name: "Parts", img: "zomboss", flags: 0, minActive: "0 6,10", boxX: "[65 135]", boxY: "30", dur: "80", speed: "[600 800]", angle: "[130 200]", sysAlpha: "1,90 0,100", spin: "[-720 720] 0,100", pScale: "[0.4 0.6]", gravY: "13" },
  { name: "Wheels", img: "wheel", flags: 0, minActive: "0 2,10", boxX: "[-15 15]", boxY: "[-20 80]", offX: "100", dur: "80", speed: "800", angle: "[130 200]", sysAlpha: "1,90 0,100", spin: "[-720 720] 0,100", pScale: "0.8", gravY: "13" },
  { name: "Brush", img: "brush", flags: 0, minActive: "0 1,10", offX: "100", dur: "80", speed: "800", angle: "[130 200]", sysAlpha: "1,90 0,100", spin: "[-720 720] 0,100", pScale: "0.8", gravY: "13" },
  { name: "ZamboniBigClouds", img: "cloud", flags: 1, sysDur: "200", rate: "150", maxLaunched: "14", radius: "[10 50]", offX: "100", dur: "[40 60]", speed: "[500 1200]", pRed: "0.5 0.25,50 0,100", pGreen: "0.8 0.4,50 0,100", pBlue: "1 0.75,50 0,100", pAlpha: "1,70 0,100", sysAlpha: "1,80 0,100", spin: "[-200 200]", pScale: "0.5,60 0,100", fricX: "0.18,40 1,100", fricY: "0.12,40 1,100" },
];
// IceSparkle.xml (UpdateIce's per-row system — the compiled file carries the
// same emission box retail draws the sheet sparkles from).
const ZAM_SPARKLE_DEFS = [
  { name: "IceSparkle0", img: "sparkle", flags: 40, rate: "12", boxX: "[23 800]", boxY: "[28 74]", dur: "[80 200]", pAlpha: "0 1,20 1,80 0,100", pScale: "1" },
];
// Jack-in-the-box detonation (PARTICLE_JACKEXPLODE, RENDER_LAYER_TOP =
// zamFx's TOP-layer path): raw SexyAppFramework/particles/JackExplode.xml
// from the decomp, ported emitter-for-emitter into the zam engine (Box +
// gravity + friction + static-image fields all supported):
// - Parts: 0->6 box motes (box [-50,0]x30) of IMAGE_ZOMBOSS_PARTICLES (5x69x80
//   cells) at 5-8 px/tick up-biased (170-200 deg), gravity 13, 80 ticks.
// - JackSmallClouds: 14x 80px ExplosionCloud puffs at 20-25 px/tick, tinted
//   purple (.4/0/.6), friction .15/.18, 40-60 ticks, sysDur 200.
// - JackExplodeBigCloud: 14x big clouds (scale 1.2-1.6 -> 0) at 5-12 px/tick,
//   tint (.4/0/0->.6), friction .12/.18, sysDur 200.
// - JackExplodeSproing: the 200x200 spring stamp, 1 mote, 40 ticks.
const JACK_DEFS = [
  { name: "Parts", img: "zomboss", flags: 0, minActive: "0 6,20", boxX: "[-50 0]", boxY: "30", dur: "80", speed: "[500 800]", angle: "[170 200]", sysAlpha: "1,90 0,100", spin: "[-720 720]", pScale: "[.2 .4]", gravY: "13" },
  { name: "JackSmallClouds", img: "cloud", flags: 1, sysDur: "200", rate: "150", maxLaunched: "14", radius: "[10 50]", dur: "[40 60]", speed: "[2000 2500]", pRed: "0.4", pGreen: "0", pBlue: "0.6", pAlpha: "1,70 0,100", sysAlpha: "1,80 0,100", spin: "[-200 200]", pScale: "0.5,60 0,100", fricX: "0.15,40 1,100", fricY: "0.18,40 1,100" },
  { name: "JackExplodeBigCloud", img: "cloud", flags: 1, sysDur: "200", rate: "150", maxLaunched: "14", radius: "[10 50]", dur: "[40 60]", speed: "[500 1200]", pRed: "0.4", pGreen: "0", pBlue: "0 .6", pAlpha: "1,70 0,100", sysAlpha: "1,80 0,100", spin: "[-200 200]", pScale: "[1.2 1.6],60 0,100", fricX: "0.12,40 1,100", fricY: "0.18,40 1,100" },
  { name: "JackExplodeSproing", img: "sproing", flags: 0, minActive: "1", sysDur: "40", dur: "40" },
];
// Mower-kill cloud (PARTICLE_MOWER_CLOUD, MowDown 8565): the 2 emitters of
// SexyAppFramework/particles/MowerCloud.xml (raw text in the decomp — "small
// + big grey-green ExplosionCloud puffs", IMAGE_EXPLOSIONCLOUD 80x80,
// main.zip particles/ExplosionCloud.png byte-identical) ported emitter-for-
// emitter into the zam engine, exactly like the Jack clouds above (same
// Circle-uniform launch, same track shapes — only the numbers differ:
// maxLaunched 3/10, tint .5/.55/.45, friction 0.30/0.24 + 0.20/0.10).
const MOWER_DEFS = [
  { name: "MowerSmallClouds", img: "cloud", flags: 1, sysDur: "200", rate: "150", maxLaunched: "3", radius: "[10 50]", dur: "[40 60]", speed: "[2000 2500]", pRed: ".5", pGreen: ".55", pBlue: ".45", pAlpha: "1,70 0", sysAlpha: "1,80 0", spin: "[-200 200]", pScale: ".5,60 0", fricX: "0.30,40 1", fricY: "0.24,40 1" },
  { name: "MowerBigClouds", img: "cloud", flags: 1, sysDur: "200", rate: "150", maxLaunched: "10", radius: "[10 50]", dur: "[40 60]", speed: "[400 700]", pRed: ".5", pGreen: ".55", pBlue: ".45", pAlpha: "1,70 0", sysAlpha: "1,80 0", spin: "[-200 200]", pScale: "[0.6 0.8],60 0", fricX: "0.20,40 1", fricY: "0.10,40 1" },
];
for (const d of [...ZAM_SMOKE_DEFS, ...ZAM_TIRE_DEFS, ...ZAM_EXPLOSION_DEFS, ...ZAM_EXPLOSION2_DEFS, ...ZAM_SPARKLE_DEFS, ...JACK_DEFS, ...MOWER_DEFS]) {
  for (const k of ["sysDur", "rate", "minActive", "maxActive", "maxLaunched", "dur",
    "radius", "boxX", "boxY", "offX", "offY", "speed", "angle",
    "pScale", "pAlpha", "pRed", "pGreen", "pBlue", "sysAlpha", "bright",
    "spin", "spinA", "fricX", "fricY", "gravX", "gravY", "posX", "posY", "awayX", "awayY"])
    d[k + "N"] = d[k] === undefined ? null : parsePowieTrack(d[k]);
}
// Static random cel counts per zam image (RenderParticle: mImageFrame =
// Rand(mImageFrames) at spawn — no AnimationRate on any zam emitter).
const ZAM_IMG_FRAMES = { smoke: 3, dirt: 8, cloud: 1, damage1: 1, zomboss: 5, wheel: 1, brush: 1, sparkle: 3, sproing: 1 };
// Grave particle defs (raw decomp XML: GraveStoneRise/GraveBuster/
// GraveBusterDie + ZombieRise's DirtSplash; art from main.zip only — repo
// RockSmall stays out of src/ per the no-retail rule, and main.zip's own
// RockSmall.png decodes all-zero alpha (verified corrupt), so the sheet in
// src/assets/images/particles/RockSmall.png is rebuilt from main.zip's
// PotatoMine_rock1-6 art as a documented stand-in). All four are Box-type
// ballistic dirt/rock systems (friction 0.02, 0.015 on the Die burst;
// gravity Y 5 x0.01; angle 0 = straight down so [150 210] fires upward),
// ticked exactly like the powie systems below (fields -> pos -> spin ->
// age; DeleteNonCrossFading on system death). ImageRow picks the sheet row
// (rock row 0, dirt row 1); frames are static per-mote randoms (no
// AnimationRate/Animated flag on any of them).
const GRAVE_DIRT_DEFS = {
  rise: { img: "dirt", row: 1, rate: "50,70 0,90", minActive: "0,0 10,40 100,50 0,70", sysDur: "120", dur: "[30 40]", boxX: "[0 75]", boxY: "[-25 25]", speed: "[100 200]", angle: "[150 210]", spin: "[-1720 1720]", pScale: "[.7 .9]", pAlpha: "1,70 0", sysAlpha: "1,92 0", fric: "0.02", grav: "5.0" },
  buster: { img: "rock", row: 0, rate: "20", sysDur: "400", dur: "[40 50]", boxX: "[-25 25]", boxY: "[-10 -18]", speed: "[100 200]", angle: "[140 220]", spin: "[-720 720]", pScale: "[.3 .8]", pAlpha: "1,70 0", sysAlpha: "1,92 0", fric: "0.02", grav: "5.0", sysPosY: "0 30" },
  die: { img: "dirt", row: 1, minActive: "20,0 0,5", sysDur: "500", dur: "[30 40]", boxX: "[-35 35]", boxY: "-14", speed: "[50 400]", angle: "[140 220]", spin: "[-720 720]", pScale: "[.7 .9]", pAlpha: "1,70 0", sysAlpha: "1,92 0", fric: "0.015", grav: "5.0" },
  splash: { img: "dirt", row: 1, rate: "50,70 0,90", minActive: "0,0 10,40 100,50 0,90", sysDur: "200", dur: "[30 40]", boxX: "[-25 25]", boxY: "[-30 0]", speed: "[100 200]", angle: "[120 240]", spin: "[-1720 1720]", pScale: "[.7 .9]", pAlpha: "1,70 0", sysAlpha: "1,92 0", fric: "0.02", grav: "5.0" },
};
for (const d of Object.values(GRAVE_DIRT_DEFS)) {
  for (const k of ["sysDur", "rate", "minActive", "maxActive", "maxLaunched", "dur", "boxX", "boxY",
    "speed", "angle", "spin", "pScale", "pAlpha", "sysAlpha", "fric", "grav", "sysPosY"])
    d[k + "N"] = d[k] === undefined ? null : parsePowieTrack(d[k]);
}
// ZombieRise's ZombieArm emitter (ZombieRise.xml): one mote (SpawnMinActive
// 1,1 0,40, DieIfOverloaded) living [100 140] ticks of a 200-tick system at
// offset (10,-25), IMAGE_ZOMBIEARM (main.zip particles/ZombieArm.png 30x57,
// single cel). Mote life is pinned to 118 at spawn (see tickGraveArm) so the
// clip-away lands exactly on the body's emergence tick. ParticleSpinAngle 200 applies ONCE at spawn (TodParticle
// FromLastTime(-1) reads 0, so the first update adds the full +200° and all
// later deltas are 0 — no RandomLaunchSpin, so it never rotates after that).
// The in-file art points down (sleeve top, hand bottom); at +200° the hand
// reaches UP out of the grave. Motion is all fields — Position Y is an
// ABSOLUTE offset track ("-50,19 -10,22 -8,80 -30,90": the mote rides 50px
// above its anchor as it emerges, easing down to ~8px above while open,
// then sinking as the clip closes; tickGraveArm replicates the retail
// FromLastTime(-1) = 0 first-tick delta so the -50 base offset applies),
// Shake 2->0 (per-tick jitter, TodParticle seeded-rand shape approximated
// with a hash of the mote age), ClipTop "1,20 0.3,22 0,80 1,85" (fully
// clipped until 20%, open while out, clipped away at 85%).
export const ZOMBIE_ARM_DEF = {
  offX: 5, offY: -25, sysDur: "200", dur: "[100 140]",
  posY: "-50,19 -10,22 -8,80 -30,90", shakeX: "2 0", shakeY: "2 0",
  clip: "1,20 0.3,22 0,80 1,85", pAlpha: "1,97 0",
};
for (const k of ["sysDur", "dur", "posY", "shakeX", "shakeY", "clip", "pAlpha"])
  ZOMBIE_ARM_DEF[k + "N"] = parsePowieTrack(ZOMBIE_ARM_DEF[k]);
// ZombieRise's DirtClumps emitter: 6 motes (SpawnMinActive 6) living the
// whole 200-tick system, IMAGE_DIRTBIG row 1 (4 frames of 80x80 grass-topped,
// static random each), scale "0,0 [.7 .9],10" (invisible until 10% life), no
// velocity/gravity/friction — just Position drift (X "[-5 5] [-25 25],50",
// Y "0 [12 18],50": sinks ~12-18px by mid-life) + Shake 2->0. Alpha is the
// system track only ("1,97 0", particle alpha unset = 1).
export const ZOMBIE_CLUMPS_DEF = {
  sysDur: "200", dur: "200", minActive: "6", sysAlpha: "1,97 0",
  scale: "0,0 [.7 .9],10", boxX: "[5 15]", boxY: "[-18 -12]",
  posX: "[-5 5] [-25 25],50", posY: "0 [12 18],50", shakeX: "2 0", shakeY: "2 0",
};
for (const k of ["sysDur", "dur", "minActive", "sysAlpha", "scale", "boxX", "boxY", "posX", "posY", "shakeX", "shakeY"])
  ZOMBIE_CLUMPS_DEF[k + "N"] = parsePowieTrack(ZOMBIE_CLUMPS_DEF[k]);
// Digger tunnel/rise shared tracks (DiggerTunnel.xml / DiggerRise.xml):
// Ground Rocks rate cycle (9 nodes over ~90 ticks, per-second), Velocity X
// "-1 0" drift, scale "0,0 [.3 .5],10" grow-in, Shake "2 0"; Tossed Rocks
// Shake "1 0". Rates are per-second like every other SpawnRate (x0.01).
const DIGGER_GROUND_RATE = [2, 4, 6, 2, 0, 8, 2, 6, 4];
const DIGGER_GROUND_VELXN = parsePowieTrack("-1 0");
const DIGGER_GROUND_SCALEN = parsePowieTrack("0,0 [.3 .5],10");
const DIGGER_GROUND_SHAKEN = parsePowieTrack("2 0");
const DIGGER_TOSSED_SHAKEN = parsePowieTrack("1 0");
const MOWER_SPEED = 3.33;
const ZOMBIE_SPAWN_X = 780, SPAWN_RAND = 40;

// ---- zombie roster: body hp + armor + speed + pick data ----
// Boss: retail pins the body reanim at mPosX=0,mPosY=0 (ZombieInitialize) and
// hits via the fixed mZombieRect (700,80,90,430). The Zombot is bigger than
// the screen — idle shows legs+pelvis (head dives into frame for attacks).
// So the ART origin is fixed (0,0); logical z.x/z.y only pick the row.
const BOSS_OX = 0, BOSS_OY = 0, BOSS_RECT_X = 700, BOSS_RECT_W = 90;
const BOSS_RECT_Y0 = 80, BOSS_RECT_Y1 = 510;
// (hp/helm/paper/door/speed from Zombie.cpp ZombieInitialize/PickRandomSpeed;
// value/pick/firstWave/startingLevel from gZombieDefs — Zombie.cpp gZombieDefs:
// {type, reanim, value, startingLevel, firstAllowedWave, pickWeight}.
// NOTE cone is value 2 / start 3 / wave 1 (not value 1 / start 2 / wave 3).)
export const ROSTER = {
  normal:   { hp: 270, speed: [0.23, 0.37], value: 1, pick: 4000, wave: 1,  start: 1,  reanim: "Zombie" },
  flag:     { hp: 270, speed: 0.45, value: 1, pick: 0, wave: 1,  start: 1,  reanim: "Zombie", flag: true, show: [] },
  cone:     { hp: 270, helm: 370, speed: [0.23, 0.37], value: 2, pick: 4000, wave: 1,  start: 3,  reanim: "Zombie", show: ["anim_cone"] },
  pole:     { hp: 500, speed: [0.66, 0.68], value: 2, pick: 2000, wave: 5,  start: 6,  reanim: "Zombie_polevaulter", vaults: true, show: ["Zombie_polevaulter_pole", "anim_hair"] },
  bucket:   { hp: 270, helm: 1100, speed: [0.23, 0.37], value: 4, pick: 3000, wave: 1,  start: 8,  reanim: "Zombie", show: ["anim_bucket"] },
  news:     { hp: 270, paper: 150, speed: [0.23, 0.37], value: 2, pick: 1000, wave: 1,  start: 11, reanim: "Zombie_paper" },
  door:     { hp: 270, shield: 1100, speed: [0.23, 0.37], value: 4, pick: 3500, wave: 5,  start: 13, reanim: "Zombie", show: ["anim_screendoor", "Zombie_outerarm_screendoor", "Zombie_innerarm_screendoor"] },
  football: { hp: 270, helm: 1400, speed: [0.66, 0.68], value: 7, pick: 2000, wave: 5,  start: 16, reanim: "Zombie_football" },
  dancer:   { hp: 500, speed: 0.45, value: 5, pick: 1000, wave: 5,  start: 18, reanim: "zombie_jackson", dances: true },
  backup:   { hp: 270, speed: 0.45, value: 1, pick: 0, wave: 5,  start: 18, reanim: "Zombie_dancer" },
  ducky:    { hp: 270, speed: [0.23, 0.37], value: 1, pick: 0, wave: 5,  start: 21, reanim: "Zombie", show: ["Zombie_duckytube"], water: true },
  snorkel:  { hp: 270, speed: [0.66, 0.68], value: 3, pick: 2000, wave: 10, start: 23, reanim: "Zombie_snorkle", water: true },
  zamboni:  { hp: 1350, speed: 0, value: 7, pick: 2000, wave: 10, start: 26, reanim: "Zombie_zamboni", chillImmune: true },
  bobsled:  { hp: 270, helm: 300, speed: 0.6, value: 3, pick: 2000, wave: 10, start: 26, reanim: "Zombie_bobsled" },
  dolphin:  { hp: 500, speed: [0.89, 0.91], value: 3, pick: 1500, wave: 10, start: 28, reanim: "zombie_dolphinrider", water: true, vaults: true },
  jack:     { hp: 500, speed: [0.66, 0.68], value: 3, pick: 1000, wave: 10, start: 31, reanim: "Zombie_jackbox", explodes: true },
  balloon:  { hp: 300, speed: [0.23, 0.37], value: 2, pick: 2000, wave: 10, start: 33, reanim: "Zombie_balloon", flying: true },
  digger:   { hp: 270, helm: 100, speed: [0.23, 0.37], value: 4, pick: 1000, wave: 10, start: 36, reanim: "Zombie_digger", digs: true },
  pogo:     { hp: 500, speed: 0.45, value: 4, pick: 1000, wave: 10, start: 38, reanim: "Zombie_pogo", hops: true },
  bungee:   { hp: 450, speed: 0, value: 3, pick: 1000, wave: 10, start: 41, reanim: "Zombie_bungi", steals: true },
  ladder:   { hp: 500, ladder: 500, speed: [0.79, 0.81], value: 4, pick: 1000, wave: 10, start: 43, reanim: "Zombie_ladder" },
  catapult: { hp: 800, speed: [0.23, 0.37], value: 5, pick: 1500, wave: 10, start: 46, reanim: "Zombie_catapult", lobs: true },
  garg:     { hp: 3000, speed: [0.23, 0.37], value: 10, pick: 1500, wave: 15, start: 48, reanim: "Zombie_gargantuar", smashes: true, chillResist: true },
  imp:      { hp: 200, speed: [0.23, 0.37], value: 10, pick: 0, wave: 15, start: 48, reanim: "Zombie_imp" },
  yeti:     { hp: 1350, speed: 0.4, value: 4, pick: 1, wave: 1,  start: 40, reanim: "Zombie_yeti" },
  boss:     { hp: 30000, speed: 0, value: 10, pick: 0, wave: 1,  start: 50, reanim: "Zombie_boss", smashes: true, stomps: true }, // stationary (retail mPosX=0, logical pos unused); hit zone fixed 700..790, art origin fixed BOSS_OX; stomps/summons pressure while you DPS it
};
export const ORDER = ["normal", "flag", "cone", "pole", "bucket", "news", "door", "football", "dancer", "backup", "ducky", "snorkel", "zamboni", "bobsled", "dolphin", "jack", "balloon", "digger", "pogo", "yeti", "bungee", "ladder", "catapult", "garg", "imp", "boss"];

function rand(rng, n) { return Math.floor(rng() * n); }

// Board::GetNumWavesPerFlag (Board.cpp:518): 10, or the whole level when
// first-time short.
export function numWavesPerFlag(numWaves, firstTime) {
  return (firstTime && numWaves < 10) ? numWaves : 10;
}
export function isFlagWave(w, numWaves, level = 0, finished = false) {
  // Board::IsFlagWave (Board.cpp:524): first-time L1 never flags; else the
  // wave index hits every per-flag boundary (final wave included when it
  // coincides — n=8 flags only wave 7, n=20 waves 9 and 19).
  if (!finished && level === 1) return false;
  const per = numWavesPerFlag(numWaves, !finished);
  return w % per === per - 1;
}
// LawnApp::CanSpawnYetis (LawnApp.cpp:2503): finished adventure and (second
// completion or current level at/past the yeti's start). Our save tracks only
// a boolean finished, so the >=2 nuance is unmappable — approximated as
// finished && level >= 40.
export function canSpawnYetis(finished, level) {
  return !!finished && level >= ROSTER.yeti.start;
}
// Board::CanZombieSpawnOnLevel (Board.cpp:2375): yeti gated above; otherwise
// start reached, nonzero pick weight, and the allowed-level table.
// Wall-nut Bowling (Challenge::InitZombieWaves 2708-2717): the generic table
// does not allow pole/pail/news on L5 yet — the bowling branch does
// (normal/cone/pail/pole/news + flag). Override for level 5 so waves match.
const BOWLING_ALLOWED = new Set(["normal", "flag", "cone", "pole", "bucket", "news"]);
export function canSpawnOnLevel(type, level, finished = false) {
  if (type === "yeti") return canSpawnYetis(finished, level);
  const r = ROSTER[type];
  if (!r || r.pick <= 0) return false;
  // Wall-nut Bowling (Challenge::InitZombieWaves 2708, reached on replays via
  // InitZombieWavesForLevel 1167): the bowling list applies with NO start
  // gate. First-time L5 runs the generic CanZombieSpawnOnLevel path (2376:
  // start-gated), so pole (6) / bucket (8) / news (11) all miss and only
  // normal/cone (+flag) spawn.
  if (level === 5) return BOWLING_ALLOWED.has(type) && (finished || level >= r.start);
  if (level < r.start) return false;
  return zombieAllowedOnLevel(type, level);
}
// Zombie::ZombieTypeCanGoInPool (Zombie.cpp:8234) / CanGoOnHighGround (8251),
// verbatim lists for RowCanHaveZombieType.
const POOL_OK = new Set(["normal", "cone", "bucket", "flag", "balloon", "snorkel", "dolphin"]);
const POOL_ONLY = new Set(["snorkel", "dolphin"]);
const HIGH_OK = new Set(ORDER.filter((t) => t !== "zamboni" && t !== "bobsled"));
// TodPickFromWeightedArray (TodCommon.cpp:118): integer roll, first bucket
// whose running total drops below zero (strict < 0, not <= 0).
function todPickWeighted(items, rng) {
  let total = 0;
  for (const it of items) total += it.w;
  let roll = Math.floor(rng() * total);
  for (const it of items) { roll -= it.w; if (roll < 0) return it.t; }
  return items[items.length - 1].t;
}
// TodCalcSmoothWeight (TodCommon.cpp) + TodPickFromSmoothArray (197) +
// TodUpdateSmoothArrayPick (231): anti-streak row picker.
function smoothWeight(w, last, secondLast) {
  if (w < 1e-6) return 0;
  const e1 = 1 / w, e2 = e1 * 2;
  const f1 = 1 + ((last + 1 - e1) / e1) * 2;
  const f2 = 1 + ((secondLast + 1 - e2) / e2) * 2;
  return w * Math.min(100, Math.max(0.01, f1 * 0.75 + f2 * 0.25));
}
function smoothPick(arr, rng) {
  let total = 0;
  for (const e of arr) total += e.w;
  const norm = 1 / total;
  let adj = 0;
  for (const e of arr) adj += smoothWeight(e.w * norm, e.last, e.second);
  let roll = rng() * adj, acc = 0, k = 0;
  for (; k < arr.length - 1; k++) {
    acc += smoothWeight(arr[k].w * norm, arr[k].last, arr[k].second);
    if (roll <= acc) break;
  }
  for (const e of arr) if (e.w > 0) { e.last += 1; e.second += 1; }
  arr[k].second = arr[k].last; arr[k].last = 0;
  return arr[k].item;
}

// Board::GetIntroducedZombieType (Board.cpp:2394): adventure levels past 1
// introduce the first enum-order def starting there (yeti only when it can
// spawn). Enum order == ORDER above (dancer precedes backup, zamboni
// precedes bobsled, garg precedes imp), so no exclusions are needed.
export function getIntroducedZombieType(level, finished = false) {
  if (level === 1) return null;
  for (const t of ORDER) {
    if (t === "yeti" && !canSpawnYetis(finished, level)) continue;
    if (ROSTER[t] && ROSTER[t].start === level) return t;
  }
  return null;
}
// Adventure-special level predicates (LawnApp.cpp Is*Level: adventure hits).
const MINI_BOSS = new Set([10, 20, 30]);
export function pickAdventureWaves(level, rng, finished = false) {
  // Board::PickZombieWaves (Board.cpp:575), adventure branch.
  const n = numWaves(level, !finished);
  const waves = [];
  const usedAll = new Set();
  const intro = getIntroducedZombieType(level, finished);
  for (let w = 0; w < n; w++) {
    const counts = {}; // mZombieTypeCount: per-wave (ZombiePickerInitForWave)
    const put = (t) => {
      list.push(t); counts[t] = (counts[t] || 0) + 1; usedAll.add(t);
      points -= ROSTER[t].value;
    };
    const list = [];
    const flagWave = isFlagWave(w, n, level, finished);
    const final = w === n - 1;
    // BungeeBlitz flag waves drop 5 bungees from the sky FIRST (PickZombie-
    // Waves 636); non-final flag waves stop there (continue skips the points,
    // intro, missing and fill below). The final flag wave falls through.
    // (points starts at 0 like ZombiePickerInit, and goes negative under the
    // bungees — the real budget is assigned below.)
    let points = 0;
    if (level === 45 && flagWave) {
      for (let i = 0; i < 5; i++) put("bungee");
      if (!final) { waves.push(list); continue; }
    }
    // zombie points: finished replays (except 5) earn faster, aWave*2/5+1.
    points = (finished && level !== 5) ? Math.floor(w * 2 / 5) + 1 : Math.floor(w / 3) + 1;
    if (flagWave) {
      const plain = Math.min(points, 8);
      points = Math.floor(points * 2.5); // int *= float truncates, like C++
      for (let i = 0; i < plain; i++) put("normal");
      put("flag");
    }
    // level multipliers (adventure hits only; challenge branches N/A).
    if (level === 5) points *= 4; // IsWallnutBowlingLevel
    else if (level === 25) points *= 4; // IsLittleTroubleLevel
    else if (MINI_BOSS.has(level)) points *= 3; // IsMiniBossLevel
    else if (level === 40) points *= 3; // IsStormyNightLevel (adventure)
    else if (level === 45) points *= 2; // IsBungeeBlitzLevel
    // mid/final-wave intro zombie (ducky intros nothing — pool handles it;
    // yeti needs !mSawYeti, which is always true at wave-pick time).
    if (intro && intro !== "ducky") {
      let spawn = false;
      if (intro === "digger" || intro === "balloon") spawn = (w + 1 === 7 || final);
      else if (intro === "yeti") spawn = (w === Math.floor(n / 2));
      else spawn = (w === Math.floor(n / 2) || final);
      if (spawn) put(intro);
    }
    if (level === 50 && final) {
      // 5-10: garg in the final wave. (The Zomboss itself arrives via
      // Challenge::PlayBossEnter, which has no equivalent in this port, so
      // the wave also carries the boss — deliberate deviation, noted.)
      put("garg"); put("boss");
    }
    if (final) { // PutInMissingZombies: one of each allowed-but-unused type
      for (const t of ORDER) {
        if (t === "yeti") continue;
        if (!(counts[t] > 0) && canSpawnOnLevel(t, level, finished)) put(t);
      }
    }
    let guard = 10000;
    while (points > 0 && list.length < 50 && guard-- > 0) { // MAX_ZOMBIES_IN_WAVE
      const cands = [];
      for (const t of ORDER) { // PickZombieType: allowed + wave + points
        const r = ROSTER[t];
        if (!canSpawnOnLevel(t, level, finished)) continue;
        if (w + 1 < r.wave || r.value > points) continue;
        cands.push({ t, w: r.pick });
      }
      if (!cands.length) break;
      put(todPickWeighted(cands, rng));
    }
    waves.push(list);
  }
  return { numWaves: n, waves };
}

// ---------- entities ----------

let NEXT_ID = 1;

// Zombie accessory visibility (Zombie::ZombieInitialize): everything detachable
// is hidden except the type's own gear (ROSTER show list) — base body/legs/
// arms/head always draw. Cutscene display zombies use this too (CutScene
// PlaceStreetZombies bodies are plain reanims, not full Zombie instances).
export function concealZombieExtras(body, type, swimming = false) {
  const hide = (p) => body.assignRenderGroupToPrefix(p, RENDER_GROUP_HIDDEN);
  hide("anim_cone"); hide("anim_bucket"); hide("anim_screendoor");
  hide("Zombie_flaghand"); hide("Zombie_duckytube"); hide("anim_tongue");
  hide("Zombie_mustache");
  hide("Zombie_outerarm_screendoor"); hide("Zombie_innerarm_screendoor");
  hide("Zombie_polevaulter_pole");
  for (const p of ((ROSTER[type] || {}).show || [])) body.assignRenderGroupToPrefix(p, RENDER_GROUP_NORMAL);
  // Zombie::SetupReanimLayers + ZombieInitialize: only cone/pail hide their
  // hair (blanket-hiding "anim_hair" here also hid Zombie_paper's
  // "anim_hairpiece" via prefix match, leaving the newspaper zombie bald —
  // source never hides hair for news, the hairpiece stays visible).
  if (type === "cone" || type === "bucket")
    body.assignRenderGroupToPrefix("anim_hair", RENDER_GROUP_HIDDEN);
  if (type === "news")
    body.assignRenderGroupToPrefix("anim_hairpiece", RENDER_GROUP_NORMAL);
  if (type === "door") {
    // Zombie::SetupReanimLayers (Zombie.cpp:871-874) -> SetupDoorArms(true):
    // while the door is held, the PLAIN arms hide and the door arms show —
    // otherwise the zombie walks around with four arms.
    hide("Zombie_outerarm_upper"); hide("Zombie_outerarm_lower"); hide("Zombie_outerarm_hand");
    hide("anim_innerarm");
  }
  if (type === "flag") { // Zombie::SetupReanimLayers (Zombie.cpp:879-884):
    // the hanging inner arm is swapped for the pole-carrying arm + grip
    // hand. Without this the Zombie_flaghand track floats detached from the
    // body (a "third hand") while the real arm hangs at the zombie's side.
    hide("anim_innerarm");
    body.assignRenderGroupToTrack("Zombie_innerarm_screendoor", RENDER_GROUP_NORMAL);
    body.assignRenderGroupToTrack("Zombie_flaghand", RENDER_GROUP_NORMAL);
  }
  // LoadPlainZombieReanim (Zombie.cpp:936): pool-row plain zombies wear the
  // ducky tube; variant zombies stick their tongue out (ZombieInitialize).
  // LoadPlainZombieReanim (Zombie.cpp:177-525): only NORMAL/DUCKY/CONE/PAIL/
  // DOOR/FLAG call LoadPlain — football/dancer/backup/news/ladder/etc never
  // wear the tube, so the swimming list is exactly the LoadPlain set.
  if (swimming && ["normal", "cone", "bucket", "flag", "door"].includes(type))
    body.assignRenderGroupToPrefix("Zombie_duckytube", RENDER_GROUP_NORMAL);
  // Zombie::LoadPlainZombieReanim (950-957): pool-row waders unclip the tube
  // (+ hands) and set up the foam water tracks. The hand names match no
  // track in this def (retail "Zombie_outerarm_hand"/"Zombie_innerarm3" vs
  // the authored "anim_innerarm3" + screendoor hands), so those two calls are
  // retail-faithful no-ops; the tube + first-match foam tracks take effect.
  if ((swimming && ["normal", "cone", "bucket", "flag", "door"].includes(type)) || type === "ducky") {
    body.setIgnoreClipRect("Zombie_duckytube", true);
    body.setIgnoreClipRect("Zombie_outerarm_hand", true);
    body.setIgnoreClipRect("Zombie_innerarm3", true);
    body.setupWaterTrack("Zombie_whitewater");
    body.setupWaterTrack("Zombie_whitewater2");
  }
}

export class Plant {
  // silent: preview-only constructions (placement ghost, held-plant cursor)
  // build the same visuals but must not produce sound — retail previews
  // draw via Plant::DrawSeedType without ever running PlantInitialize.
  constructor(board, seed, col, row, silent = false) {
    const def = PLANTS[seed];
    this.id = NEXT_ID++;
    this.board = board; this.seed = seed;
    this.col = col; this.row = row;
    this.x = gridToPixelX(col, board.bg); this.y = gridToPixelY(col, row, board.bg);
    // Plant::PlantInitialize puff/sea branch (Plant.cpp:370-377): in-play
    // plants jitter (mX += Rand(10)-5, mY += Rand(6)-3). Previews (silent)
    // skip it — retail only jitters IsInPlay() plants. (Sun-shroom's own
    // 10/10 branch at 355-359 stays unported: it sits exactly on-grid by
    // user override for presentation.)
    if (!silent && (seed === 8 || seed === 24)) {
      this.x += Math.floor(Math.random() * 10) - 5;
      this.y += Math.floor(Math.random() * 6) - 3;
    }
    // Sun-shroom (Plant.cpp:349-368): spawns in STATE_SUNSHROOM_SMALL with
    // mStateCountdown = 12000 (120s at the 100tps tick). Puff/sea jitter
    // above (Plant.cpp:370-377).
    this.w = 80; this.h = 80;
    this.hp = Plant.baseHp(seed); this.maxHp = this.hp;
    // PlantInitialize (Plant.cpp:417-419): scaredy spawns in STATE_READY.
    // PlantInitialize (Plant.cpp:444-456): in-play flowerpot/lily spawn in
    // STATE_FLOWERPOT/LILYPAD_INVULNERABLE with mStateCountdown = 100.
    // Silent previews (ghost/cursor) are IsInPlay()-false, so they skip it
    // and sit idle like DrawSeedType. Both flip to NOTREADY at 0 via
    // UpdateFlowerPot/UpdateLilypad (1631/1637) — one "invuln" state here.
    this.state = seed === 4 ? "notready" : seed === 9 ? "small" : seed === 13 ? "ready" : seed === 26 ? "low" : (seed === 16 || seed === 33) && !silent ? "invuln" : "idle"; // potato arming / sun-shroom growth / scaredy cower machine / cactus LOW hide (PlantInitialize 411-413, unconditional — previews too)
    this.sleepReanim = null; // REANIM_SLEEPING floating Z (SetSleeping 516-532) — built below when asleep, ticked in updateVisual, drawn by main.js
    this.stateCd = seed === 4 ? POTATO_ARM : seed === 9 ? 12000 : (seed === 16 || seed === 33) && !silent ? 100 : seed === 25 || seed === 27 ? 50 : 0; // PlantInitialize: SUNSHROOM_SMALL grows after 12000 ticks (Plant.cpp:366); plantern mStateCountdown 50 + blover mDoSpecialCountdown 50
    this.launchCd = def.launch > 0 ? Math.floor(Math.random() * (def.launch + 1)) : 0; // PlantInitialize: RandRangeInt(0, rate) (Plant.cpp:170) — newcomers get engaged on the next beat, not after a fixed 100t idle
    if (seed === 1 || seed === 9) this.launchCd = 300 + Math.floor(Math.random() * (def.launch / 2 - 300 + 1)); // sun producers: RandRangeInt(300, rate/2) (Plant.cpp:170)
    this.shootingCounter = 0; // Plant::mShootingCounter — pea fires when this hits 1, heads restore at 0
    this.pendingFire = null; // {row, multi, firing[]} for the in-flight shooting anim
    this.magnetItem = null; // Plant::mMagnetItems[0]: the flying steal {type,x,y,dx,dy,img,w,h} (magnet-shroom only)
    this.onBungee = "none"; // Plant::mOnBungeeState: "none" | "grabbed" (GETTING_GRABBED_BY_BUNGEE) | "rising" (RISING_WITH_BUNGEE)
    this.sleeping = Plant.isNocturnal(seed) && !board.stageIsNight();
    this.chewCd = 0; this.fuse = 0; this.produceCd = 0;
    this.wakeUpCd = 0; // Plant::mWakeUpCounter (Plant.cpp ctor init 132): coffee sets 100, ticks in Update
    this.squished = false; this.disappearCd = 0; // Plant::mSquished + mDisappearCountdown (Squish 2361-2363: flattened, removed at 0)
    this.squashShiftY = 0; // feet-planting drop applied while squished (Plant::Draw squished branch 3991-4004: the 60.0f+aOffsetY draw point under SetScale(1,0.25) keeps the feet at the same screen Y — measured per-plant as feetBelowOrigin*0.75 at squash time, retail-flat-60 equivalent)
    this.ending = false; this.endingT = 0; // marigold STATE_MARIGOLD_ENDING + mStateCountdown (Plant.cpp:1002)
    this.flash = 0; // bite-damage flash (whole body, AnimateChewEffect 4830)
    this.recentlyEaten = 0; // Plant::mRecentlyEatenCountdown (ctor init 124): set
    // to 50 by every damaging bite (EatPlant 7031), decayed in Animate (3462).
    // Drives the nut idle freeze (AnimateNuts 3175) + starfruit fire gate (845).
    this.glow = 0; // production glow (UpdateProductionPlant 1017-1021, head only)
    this.highlighted = false; // Board::HighlightPlantsForMouse (Board.cpp:3146): shovel-hover glow
    this.shakeX = 0; this.shakeY = 0; // Plant::mShakeOffsetX/Y (Plant.cpp ctor init 0)
    this.sinkY = 0; // gravebuster EATING sink (USER OVERRIDE of Plant::UpdateReanim 2795-2798's 0->30px: the whole reanim no longer slides — the dirt ring stays pinned at the grave floor while the buster proper sinks 0->85px into it, clipped at the dirt floor in the renderer, until it is just buried the tick the stone dies. 85 = dirt-floor minus buster-crown at plant time, so the buster stays visible eating the whole way down instead of vanishing mid-countdown)
    this.blinkCd = (seed === 3 || seed === 23) ? 1000 + Math.floor(Math.random() * 1000) : 400 + Math.floor(Math.random() * 400); // PlantInitialize (Plant.cpp:161/268/283): nuts blink rarely, others 400+Rand(400)
    this.blink = null; // Plant::mBlinkReanimID overlay (AttachBlinkAnim 2917)
    // Squash flight state (Plant::UpdateSquash 1487-1620 + FindSquashTarget
    // 296-330): leap origin/dest, landing-col clamp, the preferred-target ref
    // (mTargetZombieID — a re-scanned zombie that passes the gates wins
    // immediately) + the render-band flag (RENDER_LAYER_PARTICLE from RISING
    // until death — the band never flips back).
    this.targetX = 0; // mTargetX (trigger aim: lead 0; pre-launch re-aim: lead 30)
    this.ox = 0; this.oy = 0; // leap origin snapshot (pre-launch end)
    this.destY = 0; // landing Y (GridToPixelY + 8)
    this.targetCol = 0; // PixelToGridXKeepOnBoard clamp of the aim
    this.sqTarget = null; // mTargetZombieID as a live ref
    this.flightBand = false; // PARTICLE band while rising/falling/done
    // Plant::UpdateReanim scale compensation (Plant.cpp:2789-2801): the small
    // plants scale about the reanim origin, so the offset keeps them grounded.
    // USER OVERRIDE on chomper: its authored art plants the stem ~20px left
    // of the cell corner while the head floats center-right, so the whole
    // plant reads as sitting left of its grid square (measured live: stalk
    // centroid at cell offset ~20 vs center 40). compX +20 centers the stem.
    // Render-only: every chomper combat gate (attackRect on this.x,
    // zombieInFront/resolveChomp) keys off the grid corner, never cx()/cy()
    // — and peaMuzzle only serves firing seeds — so bites still trigger
    // exactly where retail expects. Ghost/cursor/flash derive from cx(), so
    // they follow automatically; the shadow (p.x-based) is re-anchored in
    // shadowSpec (dx -1).
    this.compX = 0; this.compY = 0;
    if (seed === 4) { this.compX = 12; this.compY = 12; }
    else if (seed === 35) { this.compX = 12; this.compY = 10; }
    else if (seed === 6) { this.compX = 20; }
    this.drawOff = Plant.drawHeightOffset(board, seed, col, row, this);
    this.body = board.makeReanim(def.reanim, this.cx(), this.cy());
    // PlantInitialize SUNSHROOM (Plant.cpp:353): the body reanim rides at
    // mFrameBasePose 6 (attachment overlay base pose; the blink overlay
    // aligns against it). Set for in-play and previews alike, like source.
    if (seed === 9) this.body.frameBasePose = 6;
    // PlantInitialize (Plant.cpp:145): every body idles at its own random
    // 10-15fps — sunflowers visibly sway out of sync instead of in lockstep.
    // Plant::PlantInitialize shooter branch (Plant.cpp:197-265): the head
    // shooters (pea/snow/repeater/splitpea/threepeater/gatling; LEFTPEATER
    // shares the gate but has no seed in scope) idle at 15-20fps, and their
    // heads run at the BODY rate (heads[i] <-> body rate, 204-262).
    this.idleRate = [0, 5, 7, 28, 18, 40].includes(seed) ? 15 + Math.random() * 5 : 10 + Math.random() * 5;
    this.body.playReanim("anim_idle", LOOP, 0, this.idleRate);
    // Plant::PlantInitialize PUMPKINSHELL (Plant.cpp:378-385): the shell is
    // 120px wide (GetPlantRect mX/mWidth-20 = 100) and its back half rides on
    // render group 1 (drawn behind the sheltered plant in Plant::Draw).
    if (seed === 30) { this.w = 120; this.body.assignRenderGroupToTrack("Pumpkin_back", 1); }
    // Plant::PlantInitialize potato branch (Plant.cpp, SEED_POTATOMINE case):
    // rate is forced to 12 in ALL cases. In play the body keeps the full
    // anim_idle span above (frames 0-357: the mound grows out of the dirt,
    // holds, and sinks back over the 30s loop) with mStateCountdown = 1500 —
    // there is NO SetFramesForLayer in the in-play path. Previews (ghost +
    // held cursor: silent, never simmed, never ticked — PlantInitialize's
    // IsInPlay()-false else-branch) pose the ARMED span with STATE_POTATO_
    // ARMED instead, so the ghost reads as a potato rather than the frame-0
    // growth speck. (The in-play AssignRenderGroupToTrack("anim_glow",
    // HIDDEN) matches no track in the def and is a retail no-op — skipped.)
    if (seed === 4) {
      this.body.playReanim(silent ? "anim_armed" : "anim_idle", LOOP, 0, 12);
      if (silent) this.state = "armed";
    }
    // PlantInitialize (Plant.cpp:298-313): cherry/jalapeno arm AT PLANT TIME —
    // mDoSpecialCountdown = 100, the body sits on anim_explode PLAY_ONCE_AND_
    // HOLD (no rate set: it keeps the def default), + FOLEY_REVERSE_EXPLOSION.
    // There is no zombie-proximity trigger; the fuse burns 100 ticks and the
    // plant detonates (the old proximity gate + arm-time "hmm" were invented).
    if (seed === 2 || seed === 20) {
      this.fuse = 100;
      if (this.body.trackExists("anim_explode")) this.body.playReanim("anim_explode", PLAY_ONCE_AND_HOLD, 0, this.body.def.fps);
      if (!silent) board.sfx("reverseExplosion");
    }
    // Plant::PlantInitialize blover branch (Plant.cpp, SEED_BLOVER): in play
    // the body poses anim_blow PLAY_ONCE_AND_HOLD @20 (the blow plays when
    // the 50-tick mDoSpecialCountdown fires); previews idle at rate 10.
    if (seed === 27) {
      if (!silent) {
        if (this.body.trackExists("anim_blow")) this.body.playReanim("anim_blow", PLAY_ONCE_AND_HOLD, 0, 20);
      } else if (this.body.trackExists("anim_idle")) this.body.playReanim("anim_idle", LOOP, 0, 10);
    }
    // Plant::PlantInitialize plantern branch (SEED_PLANTERN): mStateCountdown
    // = 50 (set with the other stateCds above); the glow attaches at
    // (mX+40, mY+40) on RENDER_LAYER_FOG+1 (zen garden excepted — no zen mode
    // in this port) and SOUND_PLANTERN plays when planted in play. No update
    // branch exists for plantern in source — the fog pass reads it directly.
    // The glow renders from the sim fields (see drawFog in main.js).
    if (seed === 25 && !silent) board.sfx("plantern");
    // Plant::PlantInitialize gravebuster branch (Plant.cpp:334-344, in-play
    // only): the body sits on anim_land PLAY_ONCE_AND_HOLD with
    // STATE_GRAVEBUSTER_LANDING + FOLEY_GRAVEBUSTERCHOMP. Previews (silent)
    // take no branch — the default idle pose shows, like
    // Plant::DrawSeedType. (No SetFramesForLayer off-play, unlike potato.)
    if (seed === 11 && !silent) {
      if (this.body.trackExists("anim_land")) this.body.playReanim("anim_land", PLAY_ONCE_AND_HOLD, 0, this.body.def.fps);
      this.state = "landing";
      board.sfx("gravebusterchomp");
    }
    // Gravebuster dirt ring (USER OVERRIDE — see drawHeightOffset + the
    // grounded-dirt renderer in main.js): the DIRT track is hidden in the
    // body so the EATING sink can't drag it down with the buster; the ring
    // draws separately, pinned at the plant base (= the grave floor). The
    // track index rides along for the renderer (previews + save-load bodies
    // are built here too, so they hide it the same way).
    if (seed === 11) {
      this.dirtTrack = -1;
      const trs = this.body.def.tracks;
      for (let i = 0; i < trs.length; i++) {
        const fr = trs[i].frames;
        if (fr.length && fr.every((f) => f.key === "IMAGE_REANIM_GRAVEBUSTER_DIRT")) { this.dirtTrack = i; break; }
      }
      if (this.dirtTrack >= 0) this.body.tracks[this.dirtTrack].renderGroup = RENDER_GROUP_HIDDEN;
    }
    // PlantInitialize nocturnal path (Plant.cpp:164-165): a day-planted
    // sleeper goes through SetSleeping(true) — anim_sleep pose when the def
    // has one (sunshroom does), else the body idles at rate 1 (543-559). The
    // Zzz reanim (REANIM_SLEEPING at mX+50/mY+40) has no renderer in this
    // port — follow-up, same for all nocturnals.
    if (this.sleeping) {
      if (this.body.trackExists("anim_sleep")) this.body.playReanim("anim_sleep", LOOP, 20, this.idleRate);
      else this.body.animRate = 1;
    }
    // Plant::SetSleeping asleep branch (Plant.cpp:516-532): the floating Zzz
    // rides at (mX+50, mY+40) — fume shifts +12x (62,40), scaredy -20y
    // (50,20), gloom -12y (50,28) — LOOP at rand 6-8fps with a random 0-0.9
    // phase, one render layer above the plant (renderOrder+2).
    // REANIM_SLEEPING is the Z reanim (Reanimator.cpp:90 -> reanim\Z.reanim);
    // the ZZZ.png in main.zip is unrelated art. Headless-safe: libs may not
    // have the def (no preload outside boards), so a missing def skips.
    if (this.sleeping) this.makeSleepReanim();
    // Plant::DoSpecial INSTANT_COFFEE at plant time (Plant.cpp:4431-4443,
    // same arm-at-plant pattern as cherry/jalapeno above): the bean sits on
    // anim_crumble PLAY_ONCE_AND_HOLD @22 + FOLEY_COFFEE now; the sleeping
    // host on this cell gets mWakeUpCounter = 100, which Plant::Update
    // ticks down (FOLEY_WAKEUP at 60, SetSleeping(false) at 0). canPlant
    // already guarantees the sleeping host, so the guard is a backstop.
    // Silent previews (ghost/cursor) never cast — retail previews draw via
    // DrawSeedType without running PlantInitialize.
    if (seed === 35 && !silent) {
      this.done = true; // cast fired; UpdateCoffeeBean only waits the loop
      this.dieCd = 200; // safety cap if the crumble track is ever missing
      if (this.body.trackExists("anim_crumble")) this.body.playReanim("anim_crumble", PLAY_ONCE_AND_HOLD, 20, 22);
      const host = board.cell(col, row).base;
      if (host && !host.dead && host.sleeping) host.wakeUpCd = 100;
      board.sfx("coffee"); // FOLEY_COFFEE (4441)
    }
    this.producing = false; // one-shot produce dance in flight (sunflower)
    if (seed === 4 || seed === 35) this.body.setScale(0.8, 0.8); // potato / coffee
    // Normal-path body scale (1, except potato/coffee 0.8). Plant::Draw
    // (465A90) draws squashed plants flattened — SetScale(1, 0.25) — so
    // squish() multiplies the Y off this base (absolute, idempotent).
    // Attached heads inherit it through the attachment overlay
    // (updateAttachment folds parent scale).
    this.baseScaleX = this.body.scaleX; this.baseScaleY = this.body.scaleY;
    // Attached heads (source: PlantInitialize — peashooter/snow/repeater/gatling
    // single head on anim_stem; splitpea front+back on anim_idle; threepeater
    // one per anim_head1/2/3, all at the BODY rate — PlantInitialize 204-262
    // sets each head's mAnimRate = aBodyReanim->mAnimRate). Arrow helper so
    // `this` is the plant.
    this.heads = [];
    const mkHead = (play, on, shoot) => {
      if (!this.body.trackExists(on)) return null;
      const hr = board.makeReanim(def.reanim, this.cx(), this.cy());
      if (!hr.trackExists(play)) return null;
      hr.playReanim(play, LOOP, 0, this.idleRate);
      hr.attachTo(this.body, on);
      return { reanim: hr, play, shoot };
    };
    if (def.head) this.heads.push(mkHead(def.head, def.stem || "anim_stem", "anim_shooting"));
    for (const sp of (def.heads || [])) this.heads.push(mkHead(sp.play, sp.on, sp.shoot || "anim_shooting"));
    this.heads = this.heads.filter(Boolean);
    this.head = this.heads.length ? this.heads[0].reanim : null;
    if (seed === 34) this.body.assignRenderGroupToPrefix("Cornpult_butter", RENDER_GROUP_HIDDEN); // butter hidden until a butter shot (source: PlantInitialize)
  }
  static baseHp(seed) {
    if (seed === 3) return 4000;   // wall-nut
    if (seed === 23) return 8000;  // tall-nut
    if (seed === 30) return 4000;  // pumpkin shell
    if (seed === 36) return 400;   // garlic
    return 300;
  }
  static isNocturnal(seed) { return [8, 9, 10, 12, 13, 14, 15, 24, 31].includes(seed); } // puff/sun/fume/hypno/scaredy/ice/doom/sea/magnet
  // Plant::MakesSun (Plant.cpp:988): sunflower + sun-shroom (twinsunflower
  // has no seed in this port). Gates the bungee sunflower guard
  // (PickBungeeZombieTarget 1016-1020) and production (990).
  static makesSun(seed) { return seed === 1 || seed === 9; }
  // Plant::NotOnGround (Plant.cpp:2905): squash mid-leap, squashed plants,
  // bungee-carried (rising) plants and the dead. Gates bungee stealing,
  // umbrella defense, vaulting, chewing and stomping.
  static isAquatic(seed) { return [16, 19, 24].includes(seed); } // lily/tangle/sea-shroom plant on water
  static isFlying(seed) { return seed === 35; } // Plant::IsFlying: instant coffee is the only flying seed
  cx() { return this.x + this.compX; }
  cy() { return this.y + this.drawOff + this.compY; }
  // PlantDrawHeightOffset (Plant.cpp:3572): full per-seed table. mX/mY stay
  // the grid corner (combat rects use them raw); only the reanim rides this.
static drawHeightOffset(board, seed, col, row, self) {
    let h = 0;
    const bg = board ? board.bg : BG.DAY;
    const poolSq = board ? board.isWaterRow(row) : (seed === 16 || seed === 19 || seed === 24);
    if (seed !== 35 && poolSq) {
      // floating bob (aquatics + anything potted on water)
      const tick = board ? (board.tick | 0) : 0;
      h += Math.sin(row * Math.PI + col * 0.25 * Math.PI + tick * 2 * Math.PI / 200) * 2;
    }
    if (board && seed !== 33) {
      const cell = board.cell(col, row);
      // PlantFlowerPotHeightOffset (Plant.cpp:3611-3616): no pot offset while
      // the pot is squished or the hosted plant itself is squished.
      if (cell && cell.pot && !cell.pot.dead && !cell.pot.squished && !(self && self.squished)) h += (seed === 6 || seed === 25) ? -10 : seed === 13 ? 0 : -5;
    }
    switch (seed) {
      case 33: h += 26; break;   // flower pot
      case 16: h += 25; break;   // lilypad
      case 29: h += 10; break;   // starfruit
      case 19: h += 24; break;   // tangle kelp
      case 24: h += 28; break;   // sea-shroom
      case 35: h -= 20; break;   // coffee (flying)
      case 26: return h;          // cactus skips the rest
      case 30: h += 15; break;   // pumpkin shell
      case 8: h += 5; break;     // puff-shroom
      // USER OVERRIDE: sun-shroom rides +3 (sits visibly high on its cell
      // next to its neighbors). drawHeightOffset moves the body AND its
      // shadow together (both derive from drawOff), so the contact shadow
      // stays glued to the stem; ghost/cursor recompute it too. Combat and
      // sun-spawn are grid-keyed (this.x/this.y), untouched.
      case 9: h += 3; break;     // sun-shroom
      case 13: h -= 14; break;   // scaredy-shroom
      // USER OVERRIDE: the buster's own dirt ring must sit at the grave's
      // bottom instead of floating mid-stone (source -40 parks the ring ~46px
      // too high: ring floor y+36 vs grave floor y+82). +6 drops the ring
      // flush onto the grave floor; the EATING sink below buries the buster
      // into it. Combat/grid logic keys off this.x/this.y, untouched.
      case 11: h += 6; break;    // gravebuster
      case 21: {                 // spikeweed / spikerock
        const six = (bg === BG.POOL || bg === BG.FOG);
        const bottomRow = six ? 5 : 4;
        if (board && board.cell(col, row) && board.cell(col, row).pot) h += 5;
        else if (bg === BG.ROOF || bg === BG.BOSS) h += 15;
        else if (poolSq) h += 0;
        else if (six && row === bottomRow && col >= 7) h += 1;
        else if (row === bottomRow && col < 7) h += 12;
        else h += 15;
        break;
      }
    }
    return h;
  }
  // Plant::DrawShadow ANCHOR (Plant.cpp:3861) + TodDrawImageCelCenterScaledF
  // anchor rule (TodCommon.cpp:750): the blob's natural center renders at
  // (mX + dx + 43, mY + off + dy + 18) at any scale; at scale 1 the 86x36
  // image top-left IS (mX + dx, mY + off + dy). dx/dy below are those raw
  // formula values (an image-corner anchor, NOT a blob center).
  static shadowSpec(seed, p) {
    // No blob for these (Plant::DrawShadow early-out).
    if (seed === 11 || seed === 16 || seed === 19 || seed === 21 || seed === 24 || seed === 29) return null;
    switch (seed) {
      case 8: return { dx: -3, dy: 42, s: 0.5 };    // puff-shroom
      case 9: { // sun-shroom (Plant.cpp:3883-3894): 0.5 while small, ramping
        // 0.5->1 with the grow anim's progress, full size once grown.
        // USER OVERRIDE on the small anchor: source dy is 42 (same as puff),
        // but puff rides drawHeightOffset +5 while sun-shroom rides +0, so
        // source-exact math puts small's blob 5px ABOVE puff's on screen.
        // The user requires small to match puff exactly, hence dy 47 here
        // (identical on-screen anchor: y+0+47 == y+5+42). Growing lerps
        // 47->42 alongside the scale ramp so there is no snap at either
        // transition; big stays source-exact (42 / 1.0).
        if (p && p.state === "small") return { dx: -3, dy: 47, s: 0.5 };
        if (p && p.state === "growing" && p.body) {
          const t = Math.max(0, Math.min(1, p.body.animTime)); // 0..1 over anim_grow (HOLD)
          return { dx: -3, dy: 47 - 5 * t, s: 0.5 + 0.5 * t };
        }
        return { dx: -3, dy: 42, s: 1 };
      }
      case 37: return { dx: -7, dy: 52, s: 0.5 };   // umbrella leaf
      case 10: return { dx: -3, dy: 47, s: 1.3 };   // fume-shroom
      case 32: case 39: return { dx: -3, dy: 47, s: 1 }; // cabbage/melon
      case 34: return { dx: 0, dy: 47, s: 1 };      // kernel-pult
      // USER OVERRIDE: source is dx -9 / dy 55 / s 1 (full-size, 6px left of
      // center). The user requires the small blob centered on the shroom:
      // dx -3 centers the 43px blob at cell middle (same convention as puff/
      // sun). dy 58 parks the blob under the stem: measured feet span 340-352,
      // so the blob spans 329-347 — tucked under the shoes (dy 55 floated
      // 15px above the feet; dy 74 hung 10px below; dy 66/63 still read low).
      case 13: return { dx: -3, dy: 58, s: 0.5 };    // scaredy-shroom
      case 6: return { dx: -1, dy: 57, s: 1 };      // chomper (USER OVERRIDE: follows the +20 compX centering; source dx -21)
      case 33: return { dx: -4, dy: 46, s: 1 };     // flower pot
      case 23: return { dx: -3, dy: 54, s: 1.3 };    // tall-nut
      case 30: return { dx: -3, dy: 46, s: 1.4 };    // pumpkin shell
      case 26: return { dx: -8, dy: 50, s: 1 };     // cactus
      case 25: return { dx: -3, dy: 57, s: 1 };     // plantern
      case 35: return { dx: -3, dy: 81, s: 1 };     // coffee (+10 flying)
      case 17: { // squash (Plant.cpp:3861-3877): shadow slides horizontally
        // with mX (dx -3, no X compensation) but stays at HOME ground height
        // (aShadowOffsetY += GridToPixelY(mPlantCol,mRow) - mY + 5, net home +
        // off + 56) through the 120px rise and the fall — never rises, never
        // scaled. No pool branch: it sits at home even over a pool landing,
        // vanishing only when the plant dies.
        if (p && p.board) return { dx: -3, dy: 56 + (gridToPixelY(p.col, p.row, p.board.bg) - p.y), s: 1 };
        return { dx: -3, dy: 56, s: 1 };
      }
      // USER OVERRIDE: potato rides dx 0 (+3 right of the source default
      // -3) — the default blob sits visibly left of the mound art. Verified
      // A/B live: naturally-armed mine, before/after crops against the cell
      // center — the +3 blob tucks symmetrically under the mound.
      case 4: return { dx: 0, dy: 51, s: 1 };      // potato mine
      default: return { dx: -3, dy: 51, s: 1 };
    }
  }
  syncPos(dx = 0, dy = 0) {
    this.drawOff = Plant.drawHeightOffset(this.board, this.seed, this.col, this.row, this);
    // sinkY rides the BODY position only (UpdateReanim's aOffsetY feeds
    // SetPosition on the body reanim): the mX/mY-based shadow stays put.
    const sk = this.sinkY || 0;
    // Squash drop (Plant::Draw squished branch 3991-4004): the flatten
    // scales about the body origin, so the origin drops by
    // feetBelowOrigin*0.75 to keep the feet planted — retail's 60.0f.
    // Heads ride along: updateAttachment copies the body x/y every draw.
    const sq = this.squished ? (this.squashShiftY || 0) : 0;
    this.body.x = this.cx() + dx; this.body.y = this.cy() + dy + sk + sq;
    for (const h of this.heads) { h.reanim.x = this.cx() + dx; h.reanim.y = this.cy() + dy + sk + sq; }
  }
  // Visual tick only (reanim advance + flash/glow decay + blink): the
  // Sexy engine ticks all live reanims every frame, so board plants sway
  // through the level intro — including the L5 pre-plants during the
  // frozen shovel tutorial. Game logic stays in update().
  notOnGround() {
    if (this.seed === 17 && (this.state === "rising" || this.state === "falling" || this.state === "done")) return true;
    return this.squished || this.onBungee === "rising" || this.dead;
  }
  updateVisual() {
    // Squished plants (Plant::Animate 3475-3479): the anim freezes — mFrame
    // resets and the fn returns before nuts/garlic/pumpkin anims, blink, and
    // the ping-pong counter — while the flash decays above still tick down
    // (3462-3473). UpdateReanim's body advance still runs in retail but the
    // squished Draw branch never uses the reanim (static cached frame), so
    // visibly the pancake is frozen. The countdown ticks in update().
    if (this.squished) {
      if (this.flash > 0) this.flash--;
      if (this.glow > 0) this.glow--;
      if (this.recentlyEaten > 0) this.recentlyEaten--;
      return;
    }
    this.body.update(); for (const h of this.heads) h.reanim.update();
    if (this.sleepReanim) this.sleepReanim.update(); // the floating Zzz ticks with the plant (Sexy engine ticks all reanims)
    // Plant::Animate (Plant.cpp) — cherry/jalapeno jitter ±1px every tick
    // (RandRangeFloat(-1,1) into mShakeOffsetX/Y, added to the body position
    // in Plant::UpdateReanim). Ghost/cursor previews never call updateVisual,
    // so they correctly stay still.
    if (this.seed === 2 || this.seed === 20) { this.shakeX = Math.random() * 2 - 1; this.shakeY = Math.random() * 2 - 1; }
    this.syncPos(this.shakeX, this.shakeY);
    if (this.flash > 0) this.flash--;
    if (this.glow > 0) this.glow--;
    // Plant::Animate (3454): countdown decay runs before the nut/starfruit
    // visuals below + UpdateBlink (3462-3494).
    if (this.recentlyEaten > 0) this.recentlyEaten--;
    if (this.seed === 3 || this.seed === 23) this.animateNuts(); // 3481
    else if (this.seed === 30) this.animatePumpkin(); // 3489-3491
    this.updateBlink(); // Plant::Animate (Plant.cpp:3494) — flash decay + blink run pre-sleep, like here
  }
  update() {
    const b = this.board;
    this.updateVisual();
    // Squished plants (Plant::Squish 2361): flattened (body scaleY 0.25, set
    // in squish()), removed when the disappear countdown hits 0.
    if (this.squished) {
      if (--this.disappearCd <= 0) this.die();
      return;
    }
    // Plant::Update wake-up tick (Plant.cpp:2547-2558): runs even while
    // asleep (ahead of the 2560 asleep return), so a woken shroom finishes
    // the same tick awake. FOLEY_WAKEUP is flat (TodFoley.cpp:93).
    if (this.wakeUpCd > 0) {
      if (--this.wakeUpCd === 60) b.sfx("wakeup");
      if (this.wakeUpCd === 0) this.setSleeping(false);
    }
    if (this.sleeping) return;
    // Plant::Update (Plant.cpp:2560): asleep, squished or bungee-carried
    // plants run no abilities — the steal victim freezes mid-pose.
    if (this.onBungee !== "none") return;
    const def = PLANTS[this.seed];
    switch (this.seed) {
      case 4: this.updatePotato(); break;      // potato mine
      case 2: case 20: this.updateFuse(); break; // cherry / jalapeno
      case 17: this.updateSquash(); break;
      case 6: this.updateChomper(); break;
      case 15: this.updateDoom(); break;
      case 14: this.updateIce(); break;
      case 27: this.updateBlover(); break;
      case 19: this.updateTangle(); break;
      case 31: this.updateMagnet(); break;
      case 11: this.updateGravebuster(); break;
      case 35: this.updateCoffee(); break;
      case 38: this.updateMarigold(); break;
      case 9: this.updateSunshroom(); break; // STATE_SUNSHROOM_SMALL/GROWING/BIG (Plant.cpp:1067)
      case 12: this.updateHypno(); break;
      case 13: this.updateScaredy(); this.updateShooter(); break; // UpdateScaredyShroom THEN shooter (Plant.cpp:2595-2600)
      case 26: this.updateShooting(); this.updateCactus(); this.updateCactusShooter(); break; // UpdateAbilities order: UpdateShooting (2563), UpdateCactus (2585), UpdateShooter cactus branch (2597)
      case 21: this.updateSpike(); break;
      case 16: case 33: this.updateUnderInvuln(); break; // UpdateLilypad/UpdateFlowerPot (Plant.cpp:1635/1629)
      case 37: this.updateUmbrella(); break; // UpdateUmbrella (Plant.cpp:1655)
      default:
        if (isShooter(this.seed)) this.updateShooter();
        else if (Plant.makesSun(this.seed)) this.updateProducer(); // MakesSun only (Plant.cpp:990)
        break;
    }
    // Produce dance follow-through: the PLAY_ONCE_AND_HOLD holds its last
    // frame, so resume the idle sway on loop-through (same one-shot/idle
    // pattern as the state-driven anims elsewhere). A grown sun-shroom
    // sways on anim_bigidle, not anim_idle.
    if (this.producing && !this.dead && this.body.loopCount > 0) {
      this.producing = false;
      const idle = (this.seed === 9 && this.state === "big" && this.body.trackExists("anim_bigidle")) ? "anim_bigidle" : "anim_idle";
      if (this.body.trackExists(idle)) this.body.playReanim(idle, LOOP, 20, this.idleRate);
    }
  }
  // Plant::GetDamageRangeFlags (Plant.cpp:583): per-seed bitmask gating
  // Zombie::EffectedByDamage. weapon 0 = PRIMARY, 1 = SECONDARY (splitpea
  // back head / cactus low). Seeds without a case return 1 (DAMAGES_GROUND).
  static damageRangeFlags(seed, weapon = 0) {
    if (seed === 26) return weapon === 1 ? DR_GROUND : DR_FLYING; // cactus
    if (seed === 2 || seed === 20 || seed === 15) return 127; // cherry/jalapeno/doom
    if (seed === 39 || seed === 32 || seed === 34) return 13; // melon/cabbage/kernel
    if (seed === 4) return 77; // potato
    if (seed === 17) return 13; // squash
    if (seed === 8 || seed === 24 || seed === 10 || seed === 6) return 9; // puff/sea/fume/chomper
    if (seed === 19) return 5; // tangle
    return DR_GROUND;
  }
  // Plant::GetPlantAttackRect (Plant.cpp:5203): per-seed X-range of the
  // shooter scan. Only x/w feed GetRectOverlap (horizontal only); the y/h
  // are informational. w/h are the plant's 80x80 box (mWidth/mHeight).
  static attackRect(seed, x, y, w, h, weapon = 0) {
    if (seed === 28 && weapon === 1) return { x: 0, w: x + 16 };
    switch (seed) {
      case 17: return { x: x + 20, w: w - 35 };
      case 6: return { x: x + 80, w: 40 };
      case 21: return { x: x + 20, w: w - 50 };
      case 4: return { x: x, w: w - 25 };
      case 22: return { x: x + 50, w: 30 };
      case 8: case 24: return { x: x + 60, w: 230 };
      case 10: return { x: x + 60, w: 340 };
      case 19: return { x: x, w: w };
      default: return { x: x + 60, w: BOARD_W };
    }
  }
  zombieInFront(maxDist = 900, row = this.row) {
    // Plant::FindTargetZombie (Plant.cpp:4817): same-row (boss hits from any
    // row) overlap of the plant attack rect with the zombie rect, with the
    // EffectedByDamage range gate. Headless zombies still draw fire — only
    // potato/chomper/tangle skip them (FindTargetZombie 471-477), squash
    // skips them via its own target fn (FindSquashTarget 296-298). Weight
    // is leftmost (-rect.mX); the +10000 flying
    // bonus never matters for the seeds reaching this helper with a flying
    // bit (potato 77 / chomper 9 have none), so leftmost-pick is exact.
    return this.findTargetZombie(row, Plant.damageRangeFlags(this.seed, 0), 0);
  }
  findTargetZombie(row, rangeFlags, weapon = 0) {
    const b = this.board;
    const ar = Plant.attackRect(this.seed, this.x, this.y, this.w, this.h, weapon);
    let best = null, bestX = Infinity;
    for (const z of b.zombies) {
      if (z.dead || z.gone || z.mowed) continue;
      const rowDev = z.type === "boss" ? 0 : z.row - row;
      if (rowDev !== 0) continue;
      if ((!z.hasHead || z.isTangleKelpTarget()) && (this.seed === 4 || this.seed === 6 || this.seed === 19)) continue;
      // Plant::FindSquashTarget (Plant.cpp:296-298): squash aims with its
      // own fn, which skips headless and tangle-kelp victims too. Squash
      // shares this helper in this port, so the seed-17 gate rides here.
      if (this.seed === 17 && (!z.hasHead || z.isTangleKelpTarget())) continue;
      if (!z.effectedByDamage(rangeFlags)) continue;
      // Per-candidate rect/gates (Plant.cpp:4895-4917). The pole shift applies
      // to polevaulter candidates in ANY phase; retail mutates the shared
      // attack rect inside the loop (cumulative across polevaulters — an
      // upstream quirk, flagged even in the decomp), this port shifts a local
      // copy per candidate instead (identical for the usual single-pole case).
      let ax = ar.x, aw = ar.w, extra = 0;
      if (this.seed === 6) {
        // Plant::FindTargetZombie chomper branch (4899-4914): diggers in
        // PHASE_DIGGER_WALKING shift the rect +20/-20; bouncing pogos and
        // bungees over another cell are never targets.
        if (z.phase === "digwalk") { ax += 20; aw -= 20; }
        if (z.phase === "bouncing") continue;
        if (z.type === "pogo" && z.hasObject) continue;
        if (z.type === "bungee" && z.bungeeCell && z.bungeeCell.col !== this.col) continue;
        if (z.eating || this.state === "bite") extra = 60; // mIsEating || CHOMPER_BITING (4913)
      }
      if (this.seed === 4) {
        if ((z.type === "pogo" && z.hasObject) || z.phase === "invault" || z.phase === "prevault") continue; // 4901 (pogo-with-stick gate: hopping pogos vault, they don't trigger the mine)
        if (z.type === "pole") { ax += 40; aw -= 40; } // 4906
        if (z.type === "bungee" && (!z.bungeeCell || z.bungeeCell.col !== this.col)) continue; // 4910 (falling bungees already fail effectedByDamage)
        if (z.eating) extra = 30; // 4915: the bite-range extension that lets a chewed potato detonate
      }
      // Plant::FindTargetZombie (Plant.cpp:558-562): tangle kelp only
      // grabs zombies that are actually in the pool (mInPool) — land
      // walkers in a pool row never trigger it.
      if (this.seed === 19 && !z.inPool) continue;
      const zr = z.zombieRect();
      if (getRectOverlap(ax, aw, zr.x, zr.w) < -extra) continue;
      if (!best || zr.x < bestX) { best = z; bestX = zr.x; }
    }
    return best;
  }
  // Per-type shooting-anim spec (Plant::FindTargetAndFire 734-751; the
  // threepeater entry documents LaunchThreepeater's 813-838 numbers but is
  // unused — seed 18 fires via launchThreepeater, never findTargetAndFire).
  // anim_shooting layers. The pea itself spawns later in updateShooting
  // when the counter hits 1 — synced to the head snapping forward, not to
  // the trigger. Gatling fires one pea at each listed counter value
  // (UpdateShooting 3263-3269).
  static shootSpec(seed) {
    if (seed === 7) return { rate: 45, counter: 26 }; // repeater (742-746)
    if (seed === 40) return { rate: 38, counter: 100, multi: [68, 51, 35, 18] }; // gatling (747-751)
    if (seed === 18) return { rate: 20, counter: 35 }; // threepeater (820-838)
    return { rate: 35, counter: 35 }; // pea / snow (736-741)
  }
  // Plant::FindTargetAndFire (Plant.cpp:715) for the head shooters: ends the
  // blink, starts the head shooting anim and sets the counter. Returns false
  // with no target (no anim, no counter). The projectile spawns later in
  // updateShooting, and FOLEY_THROW plays there too (Fire 4588). Splitpea
  // never comes through here — it fires via its own front/back triggers +
  // UpdateShooting branch below, which gate per-head instead of per-trigger.
  // (Threepeater likewise runs its own LaunchThreepeater path.)
  findTargetAndFire(row) {
    const z = this.zombieInFront(900, row);
    if (!z) return false;
    this.endBlink(); // (721)
    const spec = Plant.shootSpec(this.seed);
    const h = this.heads[0];
    const firing = [];
    if (h && h.reanim.trackExists(h.shoot)) {
      h.reanim.playReanim(h.shoot, PLAY_ONCE_AND_HOLD, 20, spec.rate);
      firing.push(h);
    }
    this.shootingCounter = spec.counter;
    this.pendingFire = { row, multi: spec.multi ? [...spec.multi] : null, firing };
    return true;
  }
  // Plant::FindTargetAndFire splitpea FRONT (Plant.cpp:734-746): the front
  // head poses anim_shooting @45 with mShootingCounter = 26. Fires at
  // UpdateShooter ==25 (979-983) and never at launch — the launch trigger
  // checks BEHIND only (948-951).
  findTargetAndFireFront(row) {
    if (!this.findTargetZombie(row, Plant.damageRangeFlags(28, 0), 0)) return false;
    this.endBlink(); // (721)
    this.shootingCounter = 26;
    this.pushSplitFire(row, this.heads[0], 45);
    return true;
  }
  // Plant::FindTargetAndFire splitpea BACK (Plant.cpp:725-732): the back head
  // (mHeadReanimID2) poses anim_splitpea_shooting @35 with
  // mShootingCounter = 26. Fires at launch (948-951) and at ==25 (979-983).
  findTargetAndFireBack(row) {
    if (!this.findTargetZombie(row, Plant.damageRangeFlags(28, 1), 1)) return false;
    this.endBlink(); // (721)
    this.shootingCounter = 26;
    this.pushSplitFire(row, this.heads[1], 35);
    return true;
  }
  // Accumulate posed splitpea heads into one pending volley (the ==25 double
  // call poses front then back; the second call must not drop the first).
  pushSplitFire(row, h, rate) {
    if (!this.pendingFire || !this.pendingFire.split) this.pendingFire = { row, split: true, firing: [] };
    this.pendingFire.row = row;
    if (h && h.reanim.trackExists(h.shoot)) {
      h.reanim.playReanim(h.shoot, PLAY_ONCE_AND_HOLD, 20, rate);
      if (!this.pendingFire.firing.includes(h)) this.pendingFire.firing.push(h);
    }
  }
  // Heads whose shooting anim finished (loopCount>0) go back to idle at the
  // body's idle rate; otherwise the counter retries at 1 (Plant.cpp:3450).
  shootHeadsDone() {
    const f = this.pendingFire;
    if (!f || !f.firing.length) return true;
    return f.firing.every((h) => h.reanim.loopCount > 0);
  }
  restoreShootHeads() {
    const f = this.pendingFire;
    if (!f) return;
    for (const h of f.firing) { // (3422-3432) StartBlend + LOOP idle at the body rate
      if (h.reanim.trackExists(h.play)) {
        h.reanim.playReanim(h.play, LOOP, 20, this.idleRate);
        h.reanim.animTime = this.body.animTime;
      }
    }
  }
  // Plant::LaunchThreepeater (Plant.cpp:804-839): fires when a target sits
  // in its own row OR either neighbor row (dirt rows can't host, via
  // Board::RowCanHaveZombies — Board.cpp:5956, bounds + non-dirt; the
  // resodded-challenge clause is N/A in adventure). Head anims are
  // conditional, not blanket: head1 (anim_shooting1) only when the row
  // BELOW can host, head2 always, head3 only when the row ABOVE can host —
  // all StartBlend(10) @20fps with mShootingCounter = 35. NOTE: no EndBlink
  // here — unlike FindTargetAndFire (721), LaunchThreepeater never ends the
  // blink; the overlay ticks out on its own (UpdateBlink). On no target the
  // counter stays 0 and the plant waits a full launch cycle (no fast retry).
  launchThreepeater() {
    const b = this.board;
    const above = this.row - 1, below = this.row + 1;
    const can = (r) => r >= 0 && r < b.rows && !b.isDirtRow(r);
    const RF = Plant.damageRangeFlags(18, 0);
    if (!(this.findTargetZombie(this.row, RF, 0)
      || (can(above) && this.findTargetZombie(above, RF, 0))
      || (can(below) && this.findTargetZombie(below, RF, 0)))) return;
    const [h1, h2, h3] = this.heads;
    if (can(below) && h1 && h1.reanim.trackExists(h1.shoot)) h1.reanim.playReanim(h1.shoot, PLAY_ONCE_AND_HOLD, 10, 20);
    if (h2 && h2.reanim.trackExists(h2.shoot)) h2.reanim.playReanim(h2.shoot, PLAY_ONCE_AND_HOLD, 10, 20);
    if (can(above) && h3 && h3.reanim.trackExists(h3.shoot)) h3.reanim.playReanim(h3.shoot, PLAY_ONCE_AND_HOLD, 10, 20);
    this.shootingCounter = 35;
    this.pendingFire = { row: this.row, firing: [h1, h2, h3].filter(Boolean) };
  }
  // Plant::UpdateShooting threepeater branch (Plant.cpp:3283-3302,
  // 3349-3381). At counter==1 each head still in PLAY_ONCE_AND_HOLD fires
  // its lane — head1 (anim_shooting1) the row BELOW, head2 its own row,
  // head3 the row ABOVE. Fire does NOT re-scan targets: every valid row
  // fires, even targetless ones (only dirt-edge rows stay silent — their
  // heads never left LOOP). At counter==0 the MIDDLE head's loop-through
  // restores all three to idle (outer heads only if still holding, blend 20
  // at the body rate with animTime sync); otherwise the counter retries at
  // 1 until it does.
  updateShootingThreepeater() {
    const HOLD = PLAY_ONCE_AND_HOLD;
    const [h1, h2, h3] = this.heads;
    this.shootingCounter--;
    if (this.shootingCounter === 1) {
      if (h1 && h1.reanim.loopType === HOLD) this.threepeaterFire(this.row + 1);
      if (h2 && h2.reanim.loopType === HOLD) this.threepeaterFire(this.row);
      if (h3 && h3.reanim.loopType === HOLD) this.threepeaterFire(this.row - 1);
      return;
    }
    if (this.shootingCounter !== 0) return;
    if (h2 && h2.reanim.loopCount > 0) {
      if (h1 && h1.reanim.loopType === HOLD && h1.reanim.trackExists(h1.play)) {
        h1.reanim.playReanim(h1.play, LOOP, 20, this.idleRate);
        h1.reanim.animTime = this.body.animTime;
      }
      if (h2.reanim.trackExists(h2.play)) {
        h2.reanim.playReanim(h2.play, LOOP, 20, this.idleRate);
        h2.reanim.animTime = this.body.animTime;
      }
      if (h3 && h3.reanim.loopType === HOLD && h3.reanim.trackExists(h3.play)) {
        h3.reanim.playReanim(h3.play, LOOP, 20, this.idleRate);
        h3.reanim.animTime = this.body.animTime;
      }
      this.pendingFire = null;
    } else this.shootingCounter = 1;
  }
  // Plant::Fire threepeater (Plant.cpp:4546/4670-4674/4770-4784):
  // PROJECTILE_PEA from the fixed origin (mX+45, mY+10) with the TARGET row
  // attached. The pea keeps that row for collision (UpdateMotion never
  // re-lanes threepeater peas — only HOMING/STAR update mRow). Side peas
  // ride MOTION_THREEPEATER (velY ∓3, *0.97/tick, shadow tracking the
  // post-decay velY); the own-row pea is STRAIGHT and torchwood-convertible
  // (PeaAboutToHitTorchwood needs MOTION_STRAIGHT). Shadow starts at the
  // target row's ground (GridToPixelY + 67, ProjectileInitialize 52) offset
  // ∓80 so the high-over-lawn gate (>90) doesn't false-trigger mid-flight.
  // FOLEY_THROW plays per Fire call (4588), i.e. per pea.
  threepeaterFire(row) {
    const b = this.board;
    const vy = row < this.row ? -3 : row > this.row ? 3 : 0;
    const col = Math.max(0, Math.min(8, Math.floor(((this.x + 45) - lawnXMin(b.bg)) / cellW(b.bg))));
    const shadowY = gridToPixelY(col, row, b.bg) + 67 + (row < this.row ? 80 : row > this.row ? -80 : 0);
    b.addProj({ x: this.x + 45, y: this.y + 10, row, type: "pea", dmg: PEA_DMG, motion: vy ? "three" : "straight", velY: vy, shadowY, rangeFlags: Plant.damageRangeFlags(18, 0) });
    b.sfx(b.throwPick());
  }
  // Plant::UpdateShooting splitpea branch (Plant.cpp:3281 + 3304-3316,
  // 3383-3406). At counter==1 each head still in PLAY_ONCE_AND_HOLD fires
  // its pea — front (anim_shooting) PRIMARY, back (anim_splitpea_shooting)
  // SECONDARY. No target re-scan: a head posed at the trigger fires even if
  // its zombie walked away, and an unposed head stays silent. At counter==0
  // each looped-through head resumes its idle at the body rate with animTime
  // sync; the branch always returns (no 3450 retry).
  updateShootingSplitpea() {
    const HOLD = PLAY_ONCE_AND_HOLD;
    const [front, back] = this.heads;
    this.shootingCounter--;
    if (this.shootingCounter === 1) {
      const row = this.pendingFire && this.pendingFire.row !== undefined ? this.pendingFire.row : this.row;
      if (front && front.reanim.loopType === HOLD) this.fireSplitPea(row, 0);
      if (back && back.reanim.loopType === HOLD) this.fireSplitPea(row, 1);
      return;
    }
    if (this.shootingCounter !== 0) return;
    if (front && front.reanim.loopCount > 0 && front.reanim.trackExists(front.play)) {
      front.reanim.playReanim(front.play, LOOP, 20, this.idleRate);
      front.reanim.animTime = this.body.animTime;
    }
    if (back && back.reanim.loopCount > 0 && back.reanim.trackExists(back.play)) {
      back.reanim.playReanim(back.play, LOOP, 20, this.idleRate);
      back.reanim.animTime = this.body.animTime;
    }
    this.pendingFire = null;
  }
  // Plant::Fire splitpea (Plant.cpp:4546/4588/4655-4669/4789-4792): per-head
  // PROJECTILE_PEA, 20 dmg, one FOLEY_THROW per pea. Both peas share the
  // live head offset (GetPeaHeadOffset — the FRONT head's stem track):
  // front at (mX+offX+24, mY+offY-33), back at (mX+offX-64, mY+offY-33)
  // (== muzzle.x-88, since the front sits at muzzle.x = mX+offX+24).
  // The back pea rides MOTION_BACKWARDS with the SECONDARY flags; the front
  // is STRAIGHT with the PRIMARY flags (torchwood-convertible).
  fireSplitPea(row, weapon) {
    const b = this.board;
    const muzzle = this.peaMuzzle();
    const RF = Plant.damageRangeFlags(28, weapon);
    if (weapon === 1) b.addProj({ x: muzzle.x - 88, y: muzzle.y, row, type: "pea", dmg: PEA_DMG, motion: "back", rangeFlags: RF });
    else b.addProj({ x: muzzle.x, y: muzzle.y, row, type: "pea", dmg: PEA_DMG, rangeFlags: RF });
    b.sfx(b.throwPick()); // FOLEY_THROW plays at Fire time (4588), not at the trigger
  }
  // Plant::UpdateShooting (Plant.cpp:3238): ticks the counter down; the pea
  // fires at counter==1 (gatling at its 4 listed values), then heads restore
  // once their anim completes.
  updateShooting() {
    if (this.shootingCounter <= 0) return;
    // Threepeater runs its own source-exact branch (per-head loop-type fire
    // + middle-head-gated restore); splitpea likewise below. Everything else
    // is the shared path.
    if (this.seed === 18) { this.updateShootingThreepeater(); return; }
    if (this.seed === 28) { this.updateShootingSplitpea(); return; }
    const pf = this.pendingFire;
    this.shootingCounter--;
    if (pf) {
      if (pf.multi) {
        if (pf.multi.includes(this.shootingCounter)) this.fireNow(pf.row);
      } else if (pf.star) {
        if (this.shootingCounter === 1) this.starFruitFire();
      } else if (pf.body) {
        if (pf.pult) {
          // Pult branch (UpdateShooting 3321-3334): at counter==1 the row is
          // re-scanned and the lob fires (possibly at empty ground when the
          // victim walked away); the counter==0 restore below is shared with
          // the body path.
          if (this.shootingCounter === 1) this.pultFire(pf.row);
        } else {
          // Body-path shot (puff family): the spore leaves at counter==1 with
          // no target re-scan (UpdateShooting 3336-3339: Fire(nullptr)).
          // Fume-shroom (UpdateShooting 3245-3249): the FUMECLOUD particle
          // joins at counter==15 at mX+85, mY+31 (AddAttachedParticle,
          // RENDER_LAYER_PARTICLE), then the cone damage fires at counter==1.
          if (pf.fume && this.shootingCounter === 15) {
            this.board.spawnFumeCloud(this.x + 85, this.y + 31, pf.row);
          }
          if (this.shootingCounter === 1) this.fireAt(null);
        }
      } else if (pf.cactus) {
        // Cactus volley (UpdateShooting 3317-3320 + else 3336-3339): the
        // weapon reads the CURRENT state, not the trigger — a LOW trigger
        // that rose mid-flight fires the HIGH spike, and vice versa.
        if (this.shootingCounter === 1) this.fireCactus(this.state === "low" ? 1 : 0);
      } else if (this.shootingCounter === 1) {
        this.fireNow(pf.row);
      }
    }
    if (this.shootingCounter === 0) {
      // Body anims (UpdateShooting 3444-3450): back to idle once the one-shot
      // finished, else retry at 1. Head shots keep their own gate below.
      if (pf && pf.body) {
        if (this.body.loopCount > 0) {
          if (this.body.trackExists("anim_idle")) this.body.playReanim("anim_idle", LOOP, 20, this.idleRate);
          this.pendingFire = null;
        } else this.shootingCounter = 1;
      }
      else if (pf && pf.cactus) {
        // Cactus restore (UpdateShooting 3407-3421 + 3444-3450): HIGH
        // resumes anim_idlehigh at def FPS; LOW (or a mid-transition
        // state) resumes the idle at def FPS (PlayIdleAnim). An unfinished
        // anim retries at 1 (3450).
        if (this.body.loopCount > 0) {
          const idle = this.state === "high" ? "anim_idlehigh" : "anim_idle";
          if (this.body.trackExists(idle)) this.body.playReanim(idle, LOOP, 20, this.body.def.fps);
          this.pendingFire = null;
        }
        else this.shootingCounter = 1;
      }
      else if (this.shootHeadsDone()) {
        this.restoreShootHeads();
        // Starfruit shoots from the body (UpdateShooting 3444-3450):
        // PlayIdleAnim at the def FPS once the anim_shoot loops through,
        // else the counter retries at 1. Head volleys (non-star) clear
        // immediately — their idle restore already ran above.
        if (pf && pf.star) {
          if (this.body.loopCount > 0) {
            if (this.body.trackExists("anim_idle")) this.body.playReanim("anim_idle", LOOP, 20, this.body.def.fps);
            this.pendingFire = null;
          } else this.shootingCounter = 1;
        } else this.pendingFire = null;
      }
      else this.shootingCounter = 1; // (3450) retry once the anim finishes
    }
  }
  // Plant::GetPeaHeadOffset (Plant.cpp): the LIVE body stem-track transform
  // + constants, evaluated at Fire time so the pea leaves the head exactly
  // on the snap. Falls back to the legacy fixed muzzle off-lawn.
  peaMuzzle() {
    let ox = 31, oy = 58; // == legacy fixed muzzle (x+55, y+25)
    const on = (PLANTS[this.seed] || {}).stem || "anim_idle";
    try {
      if (this.body.trackExists(on)) {
        const t = this.body.getCurrentTransform(this.body.findTrackIndex(on));
        if (isFinite(t.x) && isFinite(t.y)) { ox = t.x; oy = t.y; }
      }
    } catch (e) { /* headless: keep fallback */ }
    return { x: this.cx() + ox + 24, y: this.cy() + oy - 33 };
  }
  fireNow(row) {
    const b = this.board, s = this.seed;
    // Pea-family muzzles ride the live head offset (GetPeaHeadOffset).
    // (Threepeater never comes through here — it fires per-head via
    // threepeaterFire, fixed origin Fire 4670-4674, one FOLEY_THROW per pea;
    // splitpea likewise via fireSplitPea, Fire 4655-4669.)
    const muzzle = this.peaMuzzle();
    const RF = Plant.damageRangeFlags(s, 0);
    const spawn = (type, dmg, opts = {}) => b.addProj({ x: muzzle.x, y: muzzle.y, row, type, dmg, rangeFlags: RF, ...opts });
    if (s === 0) spawn("pea", PEA_DMG); // pea (Fire 4544-4554: PROJECTILE_PEA, 20 dmg)
    else if (s === 5) spawn("snow", PEA_DMG);
    else if (s === 7) spawn("pea", PEA_DMG); // one pea per Fire (4724); the second barrel is its own trigger (UpdateShooter 973)
    else if (s === 40) spawn("pea", PEA_DMG); // one per multi tick (4 per trigger)
    b.sfx(b.throwPick()); // FOLEY_THROW plays at Fire time (4588), not at the trigger
  }
  fireAt(z) {
    // Delayed trigger/UpdateShooting path for the body-spore family: puff
    // (8/24/13), fume (10), the head-pea family (0/5/7/40 — plus 28 via its
    // own front/back trigger + UpdateShooting path, 18 via its own
    // LaunchThreepeater/UpdateShooting path, 32/34/39 via the pult trigger +
    // pultFire path, and 29 via LaunchStarFruit/UpdateShooting) — the shot
    // spawns here only when that counter hits 1. Origins are the Plant::Fire
    // per-seed constants (4598-4702).
    const b = this.board, s = this.seed;
    this.endBlink(); // Plant::FindTargetAndFire ends the blink when a target is found (Plant.cpp:721)
    const RF = Plant.damageRangeFlags(s, 0);
    if (s === 8) {
      const ox = this.x + 40, oy = this.y + 40;
      b.addProj({ x: ox, y: oy, row: this.row, type: "puff", dmg: PEA_DMG, motion: "puff", rangeFlags: RF });
      b.puffMuzzle(ox + 18, oy + 13); // Fire 4713-4716: PUFFSHROOM_MUZZLE at origin+(18,13)
    }
    else if (s === 24) b.addProj({ x: this.x + 45, y: this.y + 63, row: this.row, type: "puff", dmg: PEA_DMG, motion: "puff", rangeFlags: RF }); // no muzzle in source (only puff + scaredy)
    else if (s === 13) {
      const ox = this.x + 29, oy = this.y + 21;
      // Plant::Fire motion assignment (Plant.cpp:4703): MOTION_PUFF goes to
      // PUFFSHROOM/SEASHROOM only — scaredy keeps the ProjectileInitialize
      // MOTION_STRAIGHT default, so its PROJECTILE_PUFF spores fly the full
      // screen (no 75-tick death) while targeting full range via the default
      // GetPlantAttackRect case, exactly like retail.
      b.addProj({ x: ox, y: oy, row: this.row, type: "puff", dmg: PEA_DMG, motion: "straight", rangeFlags: RF });
      b.puffMuzzle(ox + 27, oy + 13); // Fire 4718-4722: scaredy muzzle at origin+(27,13)
    }
    else if (s === 10) {
      // Plant::Fire 4524-4529: DoRowAreaDamage(20, 2U) + FOLEY_FUME — no
      // FOLEY_THROW (the throw at 4588 is the pea-branch path only).
      b.areaDamage(this.row, this.x + 60, 340, 20); // fume cone
      b.sfx("fume"); // FOLEY_FUME (pitch 10, TodFoley.cpp:40)
      return;
    }
    else if (s === 29) this.starFruitFire();
    // Pults (32/34/39) never reach fireAt — they fire delayed via pultFire
    // (UpdateShooting 3321-3334), which also owns the kernel butter roll.
    b.sfx(b.throwPick());
    // Plant::Fire 4593-4596: the puff family layers FOLEY_PUFF over the throw.
    if (s === 8 || s === 24 || s === 13) b.sfx("puff");
    // Plant::Fire 4589-4592: snow layers FOLEY_SNOW_PEA_SPARKLES (wintermelon is out of scope).
    if (s === 5) b.sfx("snowPeaSparkles");
  }
  // Plant::UpdateShooting pult branch (Plant.cpp:3321-3334): at counter==1
  // the pult re-scans its row (FindTargetZombie may return null when the
  // victim walked away — Fire then lobs at the default 700px mark) and fires
  // with the trigger-time weapon: a butter trigger reverts the
  // Cornpult_butter/kernal groups + STATE_NOTREADY here (3326-3330) and lobs
  // butter, otherwise kernel. Cabbage/melon always fire their own type.
  // Range flags are the pult 13 either way (GetDamageRangeFlags 594-598 has
  // no weapon split for pults); the scan weapon only matters for splitpea
  // rects, so it stays PRIMARY. FOLEY_THROW plays in Fire (4588) via addLob.
  pultFire(row) {
    const b = this.board;
    const buttery = this.seed === 34 && this.pendingFire && this.pendingFire.butter;
    if (buttery) {
      this.body.assignRenderGroupToPrefix("Cornpult_butter", RENDER_GROUP_HIDDEN);
      this.body.assignRenderGroupToPrefix("Cornpult_kernal", RENDER_GROUP_NORMAL);
    }
    const z = this.findTargetZombie(row, Plant.damageRangeFlags(this.seed, 0), 0);
    if (this.seed === 32) b.addLob(this, z, "cabbage", 40);
    else if (this.seed === 34 && buttery) b.addLob(this, z, "butter", 40, true);
    else if (this.seed === 34) b.addLob(this, z, "kernel", 20);
    else if (this.seed === 39) b.addLob(this, z, "melon", 80, false, true);
  }
  // Plant::StarFruitFire (Plant.cpp:908): five stars from (mX+25, mY+25) —
  // back, down, up, and the two 30° forward diagonals — all MOTION_STAR.
  // ProjectileInitialize (52 + 122-128): shadow = spawn-row ground + 67,
  // +15 for STAR; rotation spins at Rand ±0.05-0.1.
  starFruitFire() {
    const b = this.board;
    const ax = Math.cos(Math.PI / 6) * 3.33, ay = Math.sin(Math.PI / 6) * 3.33;
    const RF = Plant.damageRangeFlags(29, 0);
    const col = Math.max(0, Math.min(8, Math.floor(((this.x + 25) - lawnXMin(b.bg)) / cellW(b.bg))));
    const shadowY = gridToPixelY(col, this.row, b.bg) + 67 + 15;
    const shots = [
      { vx: -3.33, vy: 0 }, { vx: 0, vy: 3.33 }, { vx: 0, vy: -3.33 },
      { vx: ax, vy: ay }, { vx: ax, vy: -ay },
    ];
    for (const v of shots) {
      let rs = 0.05 + Math.random() * 0.05;
      if (Math.random() < 0.5) rs = -rs;
      b.addProj({ x: this.x + 25, y: this.y + 25, row: this.row, type: "star", dmg: PEA_DMG, motion: "star", velX: v.vx, velY: v.vy, shadowY, rot: 0, rotSpeed: rs, rangeFlags: RF });
    }
    b.sfx(b.throwPick()); // StarFruitFire (908): FOLEY_THROW, once per volley
  }
  // Plant::FindStarFruitTarget (Plant.cpp:843): the starfruit fires when any
  // effected zombie is behind it on its row, in its lead path off-row
  // (diggers widen the rect by 10), or inside the 30° diagonal angle bands.
  findStarFruitTarget() {
    const b = this.board;
    // FindStarFruitTarget (843-846): a recently-chewed starfruit (or any
    // recently-chewed plant) always counts as having a target.
    if (this.recentlyEaten > 0) return true;
    const cx = this.x + 40, cy = this.y + 40;
    const rf = Plant.damageRangeFlags(29, 0);
    for (const z of b.zombies) {
      if (z.dead || z.gone || z.mowed) continue;
      if (!z.effectedByDamage(rf)) continue;
      const zr = z.zombieRect();
      if (z.type === "boss" && this.col >= 5) return true;
      if (z.row === this.row) {
        if (zr.x + zr.w < cx) return true;
        continue;
      }
      const w = z.type === "digger" ? zr.w + 10 : zr.w;
      const dist = Math.hypot((zr.x + zr.w / 2) - cx, (zr.y + zr.h / 2) - cy);
      const lead = z.zombieTargetLeadX(dist / 3.33);
      const hitX = lead - w / 2;
      if (hitX + w > cx && hitX < cx) return true;
      const ang = Math.atan2((zr.y + zr.h / 2) - cy, lead - cx) * 180 / Math.PI;
      if (Math.abs(z.row - this.row) < 2) {
        if ((ang > 20 && ang < 40) || (ang < -25 && ang > -45)) return true;
      } else if ((ang > 25 && ang < 35) || (ang < -28 && ang > -38)) return true;
    }
    return false;
  }
  // Plant::UpdateScaredyShroom (Plant.cpp:1312-1373): the cower state machine.
  // A zombie inside the 120px circle at (mX, mY+20) — any row within ±1
  // (bosses count from any row), while mind-controlled and dead/dying ones
  // never count — lowers the shroom (anim_scared @10 PLAY_ONCE_AND_HOLD);
  // on loop-through it sits SCARED (anim_scaredidle LOOP — PlayBodyReanim
  // only applies rates > 0, so the 0.0 rate keeps the incoming 10fps and the
  // idle trembles). Once clear it raises (anim_grow @rand 7-12 HOLD) and
  // resumes idling (PlayIdleAnim @rand 10-15). Any non-READY state pins the
  // launch counter full, so UpdateShooter below never fires while cowering.
  // Skipped while a shot is in flight (mShootingCounter 1314-1315).
  updateScaredy() {
    if (this.shootingCounter > 0) return;
    const b = this.board;
    let nearby = false;
    for (const z of b.zombies) {
      if (z.ally || z.dead || z.gone || z.mowed || z.burnT > 0) continue; // mind-controlled + IsDeadOrDying
      const dy = z.type === "boss" ? 0 : z.row - this.row;
      if (dy > 1 || dy < -1) continue;
      if (circleRectOverlap(this.x, this.y + 20, 120, z.zombieRect())) { nearby = true; break; }
    }
    // Pre-patch saves never saw these states; normalize defensively so a
    // stale "idle" can't pin the launcher forever.
    if (this.state !== "ready" && this.state !== "lowering" && this.state !== "scared" && this.state !== "raising") this.state = "ready";
    const play = (name, loop, blend, rate) => { if (this.body.trackExists(name)) this.body.playReanim(name, loop, blend, rate); };
    if (this.state === "ready") {
      if (nearby) {
        this.state = "lowering";
        play("anim_scared", PLAY_ONCE_AND_HOLD, 10, 10);
      }
    } else if (this.state === "lowering") {
      if (this.body.loopCount > 0) {
        this.state = "scared";
        play("anim_scaredidle", LOOP, 10, 0);
      }
    } else if (this.state === "scared") {
      if (!nearby) {
        this.state = "raising";
        play("anim_grow", PLAY_ONCE_AND_HOLD, 10, 7 + Math.random() * 5);
      }
    } else if (this.state === "raising") {
      if (this.body.loopCount > 0) {
        this.state = "ready";
        play("anim_idle", LOOP, 20, 10 + Math.random() * 5); // PlayIdleAnim (5264): fresh rand 10-15
      }
    }
    if (this.state !== "ready") this.launchCd = PLANTS[this.seed].launch;
  }
  // Plant::UpdateCactus (Plant.cpp:1718-1760): the rise/lower machine. LOW
  // snipes ground zombies (SECONDARY) while HIGH pops balloons (PRIMARY);
  // the RISE trip is a flying (PRIMARY) target in range. Frozen while a
  // shot is in flight (1720). Rise plays anim_rise HOLD @defFPS +
  // FOLEY_PLANTGROW ("grow"); on loop-through it sits HIGH on
  // anim_idlehigh (rate 0 keeps the rise's def-FPS rate, 1729) and fires on
  // the next shooter tick (launchCd 1, 1735). HIGH with no flying target
  // lowers (anim_lower HOLD @defFPS); on loop-through it sits LOW on the
  // idle (PlayIdleAnim(0.0), 1751). Rising/lowering plants don't shoot.
  updateCactus() {
    if (this.state !== "low" && this.state !== "high" && this.state !== "rising" && this.state !== "lowering") this.state = "low"; // pre-patch "idle" settles LOW
    if (this.shootingCounter > 0) return;
    const b = this.board, fps = this.body.def.fps;
    const play = (name, loop, blend, rate) => { if (this.body.trackExists(name)) this.body.playReanim(name, loop, blend, rate); };
    if (this.state === "rising") {
      if (this.body.loopCount > 0) {
        this.state = "high";
        play("anim_idlehigh", LOOP, 20, 0);
        this.launchCd = 1;
      }
    } else if (this.state === "high") {
      if (!this.findTargetZombie(this.row, Plant.damageRangeFlags(26, 0), 0)) {
        this.state = "lowering";
        play("anim_lower", PLAY_ONCE_AND_HOLD, 20, fps);
      }
    } else if (this.state === "lowering") {
      if (this.body.loopCount > 0) {
        this.state = "low";
        play("anim_idle", LOOP, 20, 0);
      }
    } else if (this.findTargetZombie(this.row, Plant.damageRangeFlags(26, 0), 0)) {
      this.state = "rising";
      play("anim_rise", PLAY_ONCE_AND_HOLD, 20, fps);
      b.sfx("grow");
    }
  }
  // Plant::UpdateShooter cactus branch (Plant.cpp:952-962): HIGH fires
  // PRIMARY (balloons), LOW fires SECONDARY (ground); rising/lowering
  // plants hold fire. The FindTargetAndFire return is IGNORED — a miss keeps
  // the full launch countdown (no 25-tick retry; the generic-shooter retry
  // elsewhere in this port is a port-wide convention, not source).
  updateCactusShooter() {
    if (--this.launchCd > 0) return;
    this.launchCd = PLANTS[26].launch - Math.floor(Math.random() * 15);
    if (this.state === "high") this.cactusFire(0);
    else if (this.state === "low") this.cactusFire(1);
  }
  // Plant::FindTargetAndFire cactus paths (Plant.cpp:721 + 753-757 +
  // 768-770 + 793): HIGH poses anim_shootinghigh @35 (counter 23), LOW
  // poses the body anim_shooting @35 (counter 35). The spike itself leaves
  // in updateShooting at counter==1, reading the CURRENT state.
  cactusFire(weapon) {
    const RF = Plant.damageRangeFlags(26, weapon);
    if (!this.findTargetZombie(this.row, RF, weapon)) return false; // UpdateShooter ignores this (952-962): the full countdown stands
    this.endBlink();
    const play = (name, loop, blend, rate) => { if (this.body.trackExists(name)) { this.body.playReanim(name, loop, blend, rate); return true; } return false; };
    if (weapon === 0) {
      // STATE_CACTUS_HIGH (753-755): unconditional counter 23 — no
      // TrackExists gate and no instant path on this branch.
      play("anim_shootinghigh", PLAY_ONCE_AND_HOLD, 20, 35);
      this.shootingCounter = 23;
    } else {
      if (!play("anim_shooting", PLAY_ONCE_AND_HOLD, 20, 35)) { this.fireCactus(1); return true; } // 797-798 instant path (track missing)
      this.shootingCounter = 35;
    }
    this.pendingFire = { row: this.row, cactus: true };
    return true;
  }
  // Plant::Fire cactus (Plant.cpp:4560-4562 + 4588 + 4680-4692):
  // PROJECTILE_SPIKE, 20 dmg, FOLEY_THROW. HIGH spikes leave at
  // (mX+93, mY-50) with the PRIMARY (flying-only) flags; LOW spikes at
  // (mX+70, mY+23) with the SECONDARY (ground-only) flags. No muzzle
  // particle, no snow layering. (The shared Fire -5 flowerpot shift,
  // 4703-4706, is unmodeled port-wide — plants track no potted flag — so a
  // potted cactus fires 5px high.)
  fireCactus(weapon) {
    const b = this.board;
    const ox = weapon === 0 ? this.x + 93 : this.x + 70;
    const oy = weapon === 0 ? this.y - 50 : this.y + 23;
    b.addProj({ x: ox, y: oy, row: this.row, type: "spike", dmg: PEA_DMG, motion: "straight", rangeFlags: Plant.damageRangeFlags(26, weapon) });
    b.sfx(b.throwPick());
  }
  updateShooter() {
    this.updateShooting(); // mShootingCounter runs even while targetless (Plant::UpdateShooting)
    // (No scaredy gate here: UpdateScaredyShroom pins launchCd full while
    // cowering, so the counter below never elapses — see updateScaredy.)
    if (--this.launchCd > 0) {
      // Plant::UpdateShooter (Plant.cpp:973-983): the repeater's second
      // barrel — a full second FindTargetAndFire when the post-decrement
      // counter reads 25, so each volley lands two peas (~125t apart) with
      // one FOLEY_THROW per pea. Splitpea (979-983) re-checks BOTH heads at
      // 25 — front PRIMARY, then back SECONDARY — each posing its own head
      // and setting counter 26. (LEFTPEATER shares the gate in source; no
      // such seed in scope.)
      if (this.seed === 7 && this.launchCd === 25) this.findTargetAndFire(this.row);
      else if (this.seed === 28 && this.launchCd === 25) { this.findTargetAndFireFront(this.row); this.findTargetAndFireBack(this.row); }
      return;
    }
    const def = PLANTS[this.seed];
    this.launchCd = def.launch - Math.floor(Math.random() * 15);
    // Head-pea family (0/5/7/40) starts the shooting anim here; the pea
    // spawns in updateShooting at counter==1. Splitpea (28) has its own
    // launch below (behind-check only). The puff family + fume branch
    // below; the rest (pults) fire instantly.
    // Threepeater (18) has its own trigger — Plant::LaunchThreepeater
    // (Plant.cpp:804-839): any target in its own or neighbor rows starts all
    // valid heads (no fast miss-retry; the counter stays 0 for a full cycle).
    if (this.seed === 18) { this.launchThreepeater(); return; }
    if (this.seed === 0 || this.seed === 5 || this.seed === 7 || this.seed === 40) {
      // Volley-start miss retries in 25 — repeater uses 26 so the
      // post-decrement pass above still trips its second barrel on the
      // retry tick, keeping the two-barrel rhythm across misses.
      if (!this.findTargetAndFire(this.row)) this.launchCd = this.seed === 7 ? 26 : 25;
      return;
    }
    // Plant::UpdateShooter splitpea launch (Plant.cpp:948-951): the launch
    // trigger checks BEHIND only — FindTargetAndFire(mRow, WEAPON_SECONDARY)
    // with the return ignored, so a miss keeps the full launch countdown
    // (no fast retry anywhere in source — the only 25 in UpdateShooter is
    // the ==25 check at 973). The front head fires at the ==25 gate above,
    // never here.
    if (this.seed === 28) {
      this.findTargetAndFireBack(this.row);
      return;
    }
    // Plant::LaunchStarFruit (Plant.cpp:898): body anim_shoot @28 with a 40t
    // counter (UpdateShooting fires StarFruitFire at 1); the trigger is the
    // starfruit angle/lead scan, NOT the generic row scan. No EndBlink here
    // (unlike FindTargetAndFire 721 — LaunchStarFruit never ends the blink),
    // and a miss keeps the full launch countdown (UpdateShooter 944-947
    // ignores the result — no fast retry).
    if (this.seed === 29) {
      if (!this.findStarFruitTarget()) return;
      if (this.body.trackExists("anim_shoot")) this.body.playReanim("anim_shoot", PLAY_ONCE_AND_HOLD, 20, 28);
      this.shootingCounter = 40;
      this.pendingFire = { row: this.row, star: true, firing: [] };
      return;
    }
    // Plant::FindTargetAndFire body branch (715-776): puff/scaredy/sea have
    // no head reanim, so the BODY plays anim_shooting @35 (PLAY_ONCE_AND_HOLD,
    // blend 20) with a per-seed counter (puff 29, sea 29, scaredy 25); the
    // spore itself spawns in updateShooting at counter==1 with no target
    // re-scan (UpdateShooting 3336-3339: Fire(nullptr)).
    if (this.seed === 8 || this.seed === 24 || this.seed === 13) {
      const zt = this.zombieInFront();
      if (!zt) { this.launchCd = 25; return; }
      this.endBlink(); // (721)
      if (this.body.trackExists("anim_shooting")) this.body.playReanim("anim_shooting", PLAY_ONCE_AND_HOLD, 20, 35);
      this.shootingCounter = this.seed === 13 ? 25 : 29;
      this.pendingFire = { row: this.row, body: true, firing: [] };
      return;
    }
    // Fume-shroom (FindTargetAndFire 768-776: body anim_shooting @35,
    // counter 50). The spray particle joins at counter==15 (UpdateShooting
    // 3245) and the cone damage fires at counter==1 (Fire 4524-4528).
    if (this.seed === 10) {
      const zt = this.zombieInFront();
      if (!zt) { this.launchCd = 25; return; }
      this.endBlink(); // (721)
      if (this.body.trackExists("anim_shooting")) this.body.playReanim("anim_shooting", PLAY_ONCE_AND_HOLD, 20, 35);
      this.shootingCounter = 50;
      this.pendingFire = { row: this.row, body: true, fume: true, firing: [] };
      return;
    }
    // Pults (Plant::FindTargetAndFire body branch 768-796): cabbage/kernel/
    // melon pose the BODY anim_shooting @35 with a per-seed counter (cabbage
    // 32 / kernel 30 / melon 36); the lob itself fires in UpdateShooting at
    // counter==1 with a fresh target scan (Fire can lob at empty ground when
    // the victim walked away). Kernel rolls butter at the trigger
    // (Rand(4)==0, 780-792) with the Cornpult_butter/kernal render-group swap
    // (the port tracks it on pendingFire.butter — mState is unread for kernel
    // here, so no state write); the groups revert at fire time (3326-3330).
    const z = this.zombieInFront();
    if (!z) { this.launchCd = 25; return; }
    if (this.seed === 32 || this.seed === 34 || this.seed === 39) {
      this.endBlink(); // (721)
      if (this.body.trackExists("anim_shooting")) this.body.playReanim("anim_shooting", PLAY_ONCE_AND_HOLD, 20, 35);
      let butter = false;
      if (this.seed === 34 && Math.floor(Math.random() * 4) === 0) {
        this.body.assignRenderGroupToPrefix("Cornpult_butter", RENDER_GROUP_NORMAL);
        this.body.assignRenderGroupToPrefix("Cornpult_kernal", RENDER_GROUP_HIDDEN);
        butter = true; // STATE_KERNELPULT_BUTTER read at fire time (3324)
      }
      this.shootingCounter = this.seed === 32 ? 32 : this.seed === 34 ? 30 : 36;
      this.pendingFire = { row: this.row, body: true, pult: true, butter, firing: [] };
      return;
    }
    this.fireAt(z);
  }
  // Plant::DoBlink (Plant.cpp:3042) + AttachBlinkAnim (2917) + EndBlink (3080) +
  // UpdateBlink (3096). The overlay is a same-def reanim restricted to the
  // blink-track frames (@15fps, PLAY_ONCE_FULL_LAST_FRAME_AND_HOLD) attached
  // at the face track; while it lives the body's anim_eye* group hides (3076).
  // Defs without the needed tracks skip cleanly (the 3011 nullptr return) —
  // e.g. retail sunflower has no anim_eye/anim_face tracks and its overlay
  // frames are empty, so its blink is a faithful silent no-op.
  updateBlink() {
    if (this.blink) {
      this.blink.update();
      if (this.blink.loopCount > 0) this.endBlink(); // 3098-3104
    }
    if (this.sleeping) return; // 3107
    if (this.blinkCd > 0 && --this.blinkCd === 0) this.doBlink(); // 3110-3116
  }
  doBlink() {
    const b = this.board;
    // The countdown resets first — early-outs below still consume it (3044).
    this.blinkCd = 400 + Math.floor(Math.random() * 400);
    if (this.shootingCounter > 0) return; // mShootingCounter (3046; carried plants never reach DoBlink — the update gate returns first)
    if (this.seed === 4 && this.state !== "armed") return; // unarmed potato (3049)
    if (this.seed === 26 && this.state !== "low") return; // cactus never blinks off-hide (DoBlink 3052: RISING/HIGH/LOWERING gate; moot — its def has no anim_blink, 3011)
    if (this.seed === 31 && (this.state === "sucking" || this.state === "charging")) return; // magnet mid-steal (DoBlink 3052: SUCKING/CHARGING gate)
    this.endBlink();
    // Cracked-stage blink guard (DoBlink 3061): a fully-cracked tall-nut
    // (CRACKED2 override on anim_idle) never blinks. Garlic BODY3 N/A (no
    // garlic damage art in scope — garlic isn't in the 1-9 seed set).
    if (this.seed === 23) {
      const ov = this.body.tracks[this.body.findTrackIndex("anim_idle")].imageOverride || null;
      const cracked2 = (this.body.def.images || new Map()).get("IMAGE_REANIM_TALLNUT_CRACKED2") || null;
      if (cracked2 && ov === cracked2) return; // keeps the 3044 countdown (guard sits before the 3065 nut reset)
    }
    if (this.seed === 3 || this.seed === 23) this.blinkCd = 1000 + Math.floor(Math.random() * 1000); // nuts blink rarely (3065)
    let track = "anim_blink", attachTo = this.body, attachTrack = null;
    if (this.seed === 3 || this.seed === 23) { // nuts pick twitch/twice/thrice (2925)
      const hit = Math.floor(Math.random() * 10);
      track = (hit < 1 && this.body.trackExists("anim_blink_twitch")) ? "anim_blink_twitch" : hit < 7 ? "anim_blink_twice" : "anim_blink_thrice";
    } else if (this.seed === 18) { // threepeater: random head (2938; heads[i] <-> head(i+1), guarded)
      const i = Math.floor(Math.random() * 3);
      track = "anim_blink" + (i + 1);
      if (this.heads[i]) { attachTo = this.heads[i].reanim; attachTrack = "anim_face" + (i + 1); }
    } else if (this.seed === 28) { // splitpea: front or back head (2963; guarded)
      if (Math.random() < 0.5) { track = "anim_blink"; if (this.heads[0]) { attachTo = this.heads[0].reanim; attachTrack = "anim_face"; } }
      else { track = "anim_blink2"; if (this.heads[1]) { attachTo = this.heads[1].reanim; attachTrack = "anim_face2"; } }
    } else if ((this.seed === 0 || this.seed === 5 || this.seed === 7 || this.seed === 40) && this.heads.length) {
      attachTo = this.heads[0].reanim; // pea/snow/repeater/gatling blink through the head (2991)
    }
    if (!this.body.trackExists(track)) return; // 3011 nullptr (checked on the body def)
    const ov = b.makeReanim(PLANTS[this.seed].reanim, this.cx(), this.cy());
    ov.playReanim(track, PLAY_ONCE_FULL_LAST_FRAME_AND_HOLD, 0, 15); // SetFramesForLayer + rate (3015-3017)
    // Attach point (3020-3030): explicit head-face, else anim_face, else anim_idle.
    const at = attachTrack && attachTo.trackExists(attachTrack) ? attachTrack
      : attachTo.trackExists("anim_face") ? "anim_face"
      : attachTo.trackExists("anim_idle") ? "anim_idle" : null;
    if (!at) return;
    ov.attachTo(attachTo, at); // position follows the track; draws inline during body.draw
    this.blink = ov;
    this.body.assignRenderGroupToPrefix("anim_eye", RENDER_GROUP_HIDDEN); // 3076
  }
  endBlink() {
    if (!this.blink) return;
    this.blink = null; // drop the overlay (RemoveReanimation 3082)
    if (!this.body.dead) this.body.assignRenderGroupToPrefix("anim_eye", RENDER_GROUP_NORMAL); // 3087-3090
  }
  // Plant::AnimateNuts (Plant.cpp:3121) — wall-nut (seed 3) + tall-nut (23).
  // Damage stages: below 1/3 max HP the face swaps to CRACKED2, below 2/3 to
  // CRACKED1, else the override clears (3151-3171; C++ int division, so the
  // thirds truncate — Math.trunc below). Each downward transition pops a
  // WALLNUT_EAT_LARGE burst at (mX+40, mY+10) (tall-nut 32px higher, 3144).
  // While recently chewed the idle nearly freezes (rate 0.1, 3175-3179), else
  // a stalled body resumes at a random 10-15fps (3181-3184).
  animateNuts() {
    const tall = this.seed === 23;
    const track = tall ? "anim_idle" : "anim_face"; // 3130-3141
    const c1 = tall ? "IMAGE_REANIM_TALLNUT_CRACKED1" : "IMAGE_REANIM_WALLNUT_CRACKED1";
    const c2 = tall ? "IMAGE_REANIM_TALLNUT_CRACKED2" : "IMAGE_REANIM_WALLNUT_CRACKED2";
    const third = Math.trunc(this.maxHp / 3), twoThirds = Math.trunc(this.maxHp * 2 / 3);
    const want = this.hp < third ? c2 : this.hp < twoThirds ? c1 : null;
    const imgs = this.body.def.images || new Map();
    const cur = this.body.tracks[this.body.findTrackIndex(track)].imageOverride || null;
    if ((want ? imgs.get(want) : null) !== cur) {
      if (want) this.body.setImageOverrideByKey(track, want);
      else this.body.clearImageOverride(track);
      if (want) this.board.spawnWallnutEat(this.x + 40, this.y + (tall ? 10 - 32 : 10), true); // 3154-3166
    }
    if (this.recentlyEaten > 0) { this.body.animRate = 0.1; return; } // 3175-3179
    // 3181-3184: the stalled body resumes at 10-15fps — unless it is rising
    // with a bungee (the lift pinned it at 0.1).
    if (this.body.animRate < 1.0 && this.onBungee !== "rising") this.body.animRate = 10 + Math.random() * 5;
  }
  // Plant::AnimatePumpkin (Plant.cpp:3216) — the pumpkin shell's front swaps
  // to DAMAGE1 below 2/3 max HP and DAMAGE3 below 1/3 (C++ int division, so
  // the thirds truncate — Math.trunc below), clearing above that. Unlike
  // AnimateNuts there is no crack burst and no recently-eaten idle freeze.
  animatePumpkin() {
    const track = "Pumpkin_front";
    const cur = this.body.tracks[this.body.findTrackIndex(track)].imageOverride || null;
    const imgs = this.body.def.images || new Map();
    const third = Math.trunc(this.maxHp / 3), twoThirds = Math.trunc(this.maxHp * 2 / 3);
    const want = this.hp < third ? "IMAGE_REANIM_PUMPKIN_DAMAGE3" : this.hp < twoThirds ? "IMAGE_REANIM_PUMPKIN_DAMAGE1" : null;
    if ((want ? imgs.get(want) : null) !== cur) {
      if (want) this.body.setImageOverrideByKey(track, want);
      else this.body.clearImageOverride(track);
    }
  }
  updateProducer() {    // Plant::UpdateProductionPlant (Plant.cpp:994-1000) — sunflower/sunshroom
    // share it (MakesSun 990; IsInPlay/IZombie/UPSELL/LastStand gates are N/A
    // in the adventure 1-9 scope). HasLevelAwardDropped stops ALL production
    // once the award drops — the whole function returns before the countdown.
    if (this.board.hasLevelAwardDropped()) return;
    if (--this.launchCd <= 100) {
      // The pre-production glow (1017-1021): mEatenFlashCountdown ramps 0->100
      // over the last 100 ticks, rendered through the standard additive flash
      // pass (UpdateReanimColor 2722). NOTE: the renderer caps the bite flash
      // at grayness 90 and the production glow at 60 (user overrides —
      // full-white bleached the dance and read as transparency, and the
      // face washed out at peak); ramp timing here stays source-exact.
      // The glow rides its own channel (head tracks only — stem/leaves stay
      // matte); bite damage keeps the shared whole-body flash channel.
      const glow = 100 - this.launchCd;
      if (glow > 0) this.glow = Math.max(this.glow, glow);
    }
    // The retail SunFlower art dances on every dispense (anim_producing,
    // frames 33-54: full-flower bob with the PRODUCING face overlays). The
    // decomp never plays it, but the track is real retail data and the user
    // asked for the dance: lead it so the sun pops MID-dance (at the happy-
    // face peak), not after it. Dance is 22 frames @24fps (~92 ticks); the
    // 45-tick lead puts the drop at frame ~44, overlays at their peak.
    // (Old code played it @def 12fps AT the drop: 183 ticks of post-sun
    // sway — slow, and the sun ejected before the dance even started.)
    // A grown sun-shroom dances on its big track (anim_bigproducing).
    const prodTrack = (this.seed === 9 && this.state === "big" && this.body.trackExists("anim_bigproducing"))
      ? "anim_bigproducing" : "anim_producing";
    if (!this.producing && this.launchCd <= 45 && this.launchCd > 0) {
      if (this.body.trackExists(prodTrack)) {
        this.body.playReanim(prodTrack, PLAY_ONCE_AND_HOLD, 20, 24);
        this.producing = true;
      }
    }
    if (this.launchCd > 0) return;
    const def = PLANTS[this.seed];
    this.launchCd = (def.launch - 150) + Math.floor(Math.random() * 151); // RandRangeInt(rate-150, rate) (1024)
    // Sun-shroom size gates the drop (UpdateProductionPlant 1027-1037) — the
    // old first-two-drops counter is gone; growth owns this now.
    const big = this.seed !== 9 || this.state === "big";
    this.board.addSun(this.x + 20, this.y, big ? "sun" : "smallsun");
    this.board.sfx("throw"); // FOLEY_SPAWN_SUN = SOUND_THROW (TodFoley.cpp:14)
    // Fallback: the drop arrived with no lead-in (debug-forced launchCd, or
    // a def without the track check above) — start the dance under the
    // fresh sun rather than skipping it.
    if (this.body.trackExists(prodTrack) && !this.producing) {
      this.body.playReanim(prodTrack, PLAY_ONCE_AND_HOLD, 20, 24);
      this.producing = true;
    }
  }
  // Plant::UpdateFlowerPot (Plant.cpp:1629-1633) + Plant::UpdateLilypad
  // (1635-1639): the shared Plant::Update pre-dispatch tick (2565-2566)
  // decrements mStateCountdown every awake tick; at 0 the INVULNERABLE
  // flips to NOTREADY. No anim/sfx — the lily/pot just become chewable.
  updateUnderInvuln() {
    if (this.stateCd > 0) this.stateCd--; // Update pre-dispatch tick (2565)
    if (this.state === "invuln" && this.stateCd === 0) this.state = "notready";
  }
  // Plant::UpdateUmbrella (Plant.cpp:1655): the block machine. Triggered
  // counts its 5-tick countdown down, then flips to reflecting (the port's
  // fixed draw bands skip the PROJECTILE row+1 render-order bump — noted);
  // reflecting holds anim_block until the loop completes, then idles.
  updateUmbrella() {
    if (this.state === "triggered") {
      if (this.stateCd > 0) this.stateCd--; // Update pre-dispatch tick (2565)
      if (this.stateCd === 0) this.state = "reflecting";
    } else if (this.state === "reflecting") {
      if (this.body.loopCount > 0) {
        if (this.body.trackExists("anim_idle")) this.body.playReanim("anim_idle", LOOP, 20, this.idleRate);
        this.state = "idle";
      }
    }
  }
  // Plant::DoSpecial UMBRELLA (Plant.cpp:4395): the spring-up block — only
  // from a resting pose (triggered/reflecting re-blocks are ignored).
  doSpecialUmbrella() {
    if (this.state === "triggered" || this.state === "reflecting") return;
    this.state = "triggered";
    this.stateCd = 5;
    if (this.body.trackExists("anim_block")) this.body.playReanim("anim_block", PLAY_ONCE_AND_HOLD, 0, 22);
  }
  // Plant::UpdateSunShroom (Plant.cpp:1067-1093): the growth state machine.
  // The 12000-tick countdown ticks here (UpdateAbilities decrements
  // mStateCountdown every awake in-play tick, before this dispatch); at 0
  // the small shroom plays anim_grow PLAY_ONCE_AND_HOLD blend 10 @12 +
  // FOLEY_PLANTGROW and enters GROWING. On the grow anim's loop-through it
  // settles into anim_bigidle LOOP blend 10 @rand 12-15 as BIG. Production
  // runs in SMALL (smallsuns) and BIG (normal suns) but never mid-grow —
  // the old first-two-drops counter is replaced by the real gate.
  updateSunshroom() {
    if (this.stateCd > 0) this.stateCd--; // UpdateAbilities pre-dispatch tick
    if (this.state === "small") {
      if (this.stateCd === 0) {
        if (this.body.trackExists("anim_grow")) this.body.playReanim("anim_grow", PLAY_ONCE_AND_HOLD, 10, 12);
        this.state = "growing";
        this.board.sfx("grow"); // FOLEY_PLANTGROW = SOUND_PLANTGROW, pitch -2 (TodFoley.cpp:73)
      }
      this.updateProducer();
    } else if (this.state === "growing") {
      if (this.body.loopCount > 0) {
        if (this.body.trackExists("anim_bigidle")) this.body.playReanim("anim_bigidle", LOOP, 10, 12 + Math.random() * 3);
        this.state = "big";
      }
    } else this.updateProducer(); // STATE_SUNSHROOM_BIG
  }
  // Plant::UpdatePotato (Plant.cpp:1139): NOTREADY waits on mStateCountdown
  // (ticked down in Plant::Update, like ours in the branch below) -> at 0:
  // AddTodParticle(POTATO_MINE_RISE) at the plant center, PlayBodyReanim
  // anim_rise PLAY_ONCE_AND_HOLD blend 20 @18, STATE_POTATO_RISING,
  // FOLEY_DIRT_RISE (pitched dirt_rise). RISING flips to ARMED on loopCount:
  // PlayBodyReanim anim_armed LOOP @RandRangeFloat(12,15), plus a light
  // reanim (AddReanimation same def, LOOP at armed-rate-2, SetFramesForLayer
  // anim_glow + ShowOnlyTrack anim_glow + attach at anim_light) whose track
  // names exist NOWHERE in the def — every track hides, so it draws nothing
  // in retail either; only the blinkCd reset below is observable (the visible
  // LIGHT2 blink lives in the body's own light21-24 tracks inside the armed
  // span). ARMED: FindTargetZombie PRIMARY -> DoSpecial, else modulate the
  // (invisible) light's frameCount by TodAnimateCurve(200,50,distance,10,3).
  updatePotato() {
    if (this.state === "notready") {
      if (--this.stateCd <= 0) {
        this.state = "rising";
        this.board.spawnDirt(this.x + 40, this.y + 40); // PARTICLE_POTATO_MINE_RISE stand-in (compiled XML is a redirect stub): dirt burst at the center
        if (this.body.trackExists("anim_rise")) this.body.playReanim("anim_rise", PLAY_ONCE_AND_HOLD, 20, 18);
        this.board.sfx("dirtRise");
      }
      return;
    }
    if (this.state === "rising") {
      if (this.body.loopCount > 0) {
        this.state = "armed";
        // Plant::UpdatePotatoMine (1157): armed LOOP at per-plant 12-15fps.
        const rate = 12 + Math.random() * 3;
        if (this.body.trackExists("anim_armed")) this.body.playReanim("anim_armed", LOOP, 0, rate);
        this.blinkCd = 400 + Math.floor(Math.random() * 4000); // arming reset (1171; the generic 400+Rand(400) init already ran at plant time)
        // (light reanim skipped: invisible in retail, see above)
      }
      return;
    }
    const z = this.zombieInFront();
    if (z) this.detonatePotato();
    // Plant::DoSpecial POTATOMINE body (Plant.cpp:4416), shared by the
    // ARMED trigger above and Squish below (Squish detonates regardless of
    // any target in front).
    // (ARMED else-branch light frameCount modulation drives the invisible
    // reanim — omitted with it.)
  }
  detonatePotato() {
    this.board.sfx("potato");
    this.board.killAllZombiesInRadius(this.row, this.x + 20, this.y + 40, POTATO_RADIUS, 0, false, 77);
    this.board.potatoBlast(this.x + 40, this.y + 40);
    this.board.shake = 3;
    this.die();
  }
  // Plant::Squish (Plant.cpp:2338). NotOnGround (squash mid-leap) skips;
  // awake bombs (cherry/jalapeno/doom/ice-shroom) and armed potatoes
  // detonate on the spot (DoSpecial, via the live fuse paths with the fuse
  // forced to 1 so they fire synchronously); an in-flight squash
  // (anything but its NOTREADY wait state) is immune and the machine rolls
  // on; everything else flattens (FOLEY_SQUISH) and is removed 500 ticks
  // later. The ladder-kill (GetLadderAt) has no port equivalent (no ladder
  // grid items in scope); RemoveEffects is a no-op here (blink/glow are
  // fields, not particles).
  squish() {
    if (this.seed === 17 && (this.state === "rising" || this.state === "falling" || this.state === "done")) return; // NotOnGround (2905)
    if (!this.sleeping) {
      if (this.seed === 2 || this.seed === 20 || this.seed === 15 || this.seed === 14) {
        this.fuse = 1;
        if (this.seed === 2 || this.seed === 20) this.updateFuse();
        else if (this.seed === 15) this.updateDoom();
        else this.updateIce();
        return;
      }
      if (this.seed === 4 && this.state !== "notready") { this.detonatePotato(); return; }
    }
    if (this.seed === 17 && this.state !== "idle") return; // Squash NOTREADY wait = port "idle" (PlantInitialize 106 + UpdateSquash 1487)
    this.squished = true;
    this.disappearCd = 500;
    // Plant::Draw squished branch (Plant.cpp:465A90 / 3991-4004): the plant
    // renders flattened — SetScale(1, 0.25) — with the draw point dropped so
    // the feet stay planted (retail's flat 60.0f + aOffsetY, i.e. 80*0.75
    // for a standard plant; pot -15, coffee +30-20 baked into its own
    // offsets). Our scale is about the body origin, so drop the origin by
    // the MEASURED feet-below-origin * 0.75 — exact for every seed/scale
    // (potato/coffee 0.8, tall-nut, potted) with no per-seed table.
    // Measured BEFORE the flatten (base scale still live). Absolute set
    // (idempotent). RemoveEffects (2325): retail drops the blink + sleeping
    // reanims at squash time — the blink overlay dies here, the Zzz too
    // (heads stay: retail's static cached frame bakes them in, ours keeps
    // drawing the frozen live heads). DoBlink's NotOnGround gate stops new
    // blinks while flattened.
    try {
      // Feet = union bottom of the body AND attached heads: shooter bodies
      // only ever show rect-less marker tracks (anim_idle/anim_stem) — all
      // their art hangs off the head reanim — so the body alone measures
      // nothing. Head overlays hold the last draw's parent matrix (one tick
      // stale at most — the pose is frozen from here on anyway).
      let fb = this.body.visibleBottom();
      for (const h of this.heads) {
        const hb = h.reanim.visibleBottom();
        if (hb != null && (fb == null || hb > fb)) fb = hb;
      }
      this.squashShiftY = fb != null ? Math.max(0, (fb - this.body.y) * 0.75) : 60 * this.baseScaleY;
    } catch (e) { this.squashShiftY = 60 * this.baseScaleY; }
    this.endBlink();
    this.sleepReanim = null;
    this.body.setScale(this.baseScaleX, this.baseScaleY * 0.25);
    this.syncPos(this.shakeX, this.shakeY);
    this.board.sfx(Math.random() < 0.5 ? "chomp" : "chomp2"); // FOLEY_SQUISH (flat)
  }
  // Plant::DoSpecial cherry/jalapeno (Plant.cpp:4354-4393), driven by the
  // plant-time 100-tick fuse above (Plant::Update 2601-2607 fires DoSpecial
  // at 0 — there is no proximity trigger). Cherry: FOLEY_CHERRYBOMB +
  // FOLEY_JUICY (flat cherry, pitched juicy), KillAllZombiesInRadius(115, 1
  // row each way, burn, range flags 127), PARTICLE_POWIE at the plant center
  // (AddTodParticle 4361, RENDER_LAYER_TOP — the 14+14 orange puffs + POW
  // word system in spawnPowie), ShakeBoard(3,-4), self-destruct.
  // Jalapeno: FOLEY_JALAPENO_IGNITE + FOLEY_JUICY, DoFwoosh fire trail
  // (Board::DoFwoosh, 12 REANIM_JALAPENO_FIRE flames across the row),
  // ShakeBoard(3,-4), Plant::BurnRow, mIceTimer[row] = 20, Die. There is
  // no blast flash or particle burst in this path (unlike cherry/doom).
  updateFuse() {
    if (--this.fuse > 0) return;
    if (this.seed === 2) {
      this.board.sfx("cherry"); this.board.sfx("juicy");
      this.board.killAllZombiesInRadius(this.row, this.x + 40, this.y + 40, CHERRY_RADIUS, 1, true, 127);
      this.board.spawnPowie(this.x + 40, this.y + 40);
      this.board.shake = 3;
    } else {
      this.board.sfx("jalapeno"); this.board.sfx("juicy");
      this.board.doFwoosh(this.row);
      this.board.shake = 3;
      this.board.burnRow(this.row);
      if (this.board.iceTimer) this.board.iceTimer[this.row] = 20;
    }
    this.die();
  }
  // Plant::FindSquashTarget (Plant.cpp:296-330): same-row (boss: any row)
  // EffectedByDamage(13) scan with headless + tangle-victim skips (shared
  // with findTargetZombie's seed-17 gate at 1286). Prevault candidates only
  // count left of mX+20; vaulting/diving/riding/dolphin-jump phases and
  // sled-teamed bobsleds never count. Range is -overlap (eating: 110, else
  // 70); the plant-side gate shifts -60 for post/prevault, dolphin
  // poolwalkers, imps and footballs (scary-potter N/A in scope), skipped
  // for allies (IsWalkingBackwards). A passing preferred target wins
  // immediately; else the deepest overlap wins.
  findSquashTarget() {
    const b = this.board;
    const RF = Plant.damageRangeFlags(17, 0);
    const ar = Plant.attackRect(17, this.x, this.y, this.w, this.h, 0);
    let best = null, bestRange = 0;
    for (const z of b.zombies) {
      if (z.dead || z.gone || z.mowed) continue;
      if (z.type !== "boss" && z.row !== this.row) continue;
      if (!z.hasHead || z.isTangleKelpTarget()) continue;
      if (!z.effectedByDamage(RF)) continue;
      const zr = z.zombieRect();
      const vaultNear = z.phase === "prevault" && zr.x < this.x + 20;
      const clear = z.phase !== "prevault" && z.phase !== "invault"
        && z.phase !== "snorkel-into-pool" && z.phase !== "dolphin-into-pool"
        && z.phase !== "ride" && z.phase !== "dolphin-jump"
        && !(z.type === "bobsled" && z.bobsledPosition() !== -1);
      if (!(vaultNear || clear)) continue;
      const range = -getRectOverlap(ar.x, ar.w, zr.x, zr.w);
      if (range > (z.eating ? 110 : 70)) continue;
      let plantX = ar.x;
      if (z.phase === "post" || z.phase === "prevault" || z.phase === "dolphin-poolwalk"
        || z.type === "imp" || z.type === "football") plantX = ar.x - 60;
      if (!z.ally && zr.x + zr.w < plantX) continue;
      if (this.sqTarget && z === this.sqTarget) return z;
      if (!best || range < bestRange) { best = z; bestRange = range; }
    }
    return best;
  }
  // Plant::DoSquashDamage (Plant.cpp:1403): same-row/boss + EffectedByDamage
  // (13) zombies whose rect overlaps the attack rect (football: -20 grace)
  // take 1800 with HITS_BOTH|NOLEAVE (18U — full past shields/helms, no
  // body left behind). No foley — the landing plays it.
  squashDamage() {
    const b = this.board;
    const RF = Plant.damageRangeFlags(17, 0);
    const ar = Plant.attackRect(17, this.x, this.y, this.w, this.h, 0);
    for (const z of b.zombies) {
      if (z.dead || z.gone || z.mowed) continue;
      if (z.type !== "boss" && z.row !== this.row) continue;
      if (!z.effectedByDamage(RF)) continue;
      const zr = z.zombieRect();
      if (getRectOverlap(ar.x, ar.w, zr.x, zr.w) > (z.type === "football" ? -20 : 0)) {
        z.takeDamage(1800, DMG_HITS_BOTH | DMG_NOLEAVE);
      }
    }
  }
  // Plant::UpdateSquash (Plant.cpp:1487-1620): idle (NOTREADY) scans with
  // FindSquashTarget every tick — the trigger aims with lead 0, looks
  // left/right @24 + SQUASH_HMM ({HMM,HMM,HMM2}, first twice as likely) and
  // waits 80; pre-launch (jumpup @24, 45t) re-scans (lead 30 — aim only,
  // the target ref is NOT refreshed, so damage still prefers the trigger
  // victim); rising (50t, PARTICLE band) lerps the origin to (targetX,
  // destY-120) on EASE_IN_OUT through TodAnimateCurve(50,20,cd) — cd<=20
  // clamps at the target; falling (10t, jumpdown @60, linear) lands the
  // damage at cd==5; pool squares splash (REANIM_SPLASH at (mX-11,mY+20) +
  // set-pick SPLAT + flat ZOMBIESPLASH sample) and die at once; land
  // squares shake (1,4), THUMP (pitch 2), spawn DUST_SQUASH, wait 100, die.
  // mX/mY ride the leap (synced to the body every tick).
  updateSquash() {
    if (this.state === "idle") {
      const z = this.findSquashTarget();
      if (z) {
        this.sqTarget = z;
        this.targetX = z.zombieTargetLeadX(0) - this.w / 2;
        this.state = "look"; this.stateCd = 80;
        const look = this.targetX < this.x ? "anim_lookleft" : "anim_lookright";
        if (this.body.trackExists(look)) this.body.playReanim(look, PLAY_ONCE_AND_HOLD, 10, 24);
        this.board.sfx(this.board.squashHmmPick());
      }
      return;
    }
    if (this.state === "look") {
      if (--this.stateCd <= 0) {
        this.state = "prelaunch"; this.stateCd = 45;
        if (this.body.trackExists("anim_jumpup")) this.body.playReanim("anim_jumpup", PLAY_ONCE_AND_HOLD, 20, 24);
      }
      return;
    }
    if (this.state === "prelaunch") {
      if (--this.stateCd <= 0) {
        const z = this.findSquashTarget();
        if (z) this.targetX = z.zombieTargetLeadX(30) - this.w / 2;
        this.ox = this.x; this.oy = this.y;
        this.targetCol = Math.max(0, this.board.pixelToGridCol(this.targetX)); // PixelToGridXKeepOnBoard (Board.cpp:9032): max(col,0) — low-clamp ONLY, no high clamp
        this.destY = gridToPixelY(this.targetCol, this.row, this.board.bg) + 8;
        this.state = "rising"; this.stateCd = 50;
        this.flightBand = true;
      }
      return;
    }
    if (this.state === "rising") {
      if (--this.stateCd < 0) this.stateCd = 0;
      const k = easeInOut((50 - this.stateCd) / 30);
      this.x = this.ox + (this.targetX - this.ox) * k;
      this.y = this.oy + (this.destY - 120 - this.oy) * k;
      this.syncPos();
      if (this.stateCd === 0) {
        this.state = "falling"; this.stateCd = 10;
        if (this.body.trackExists("anim_jumpdown")) this.body.playReanim("anim_jumpdown", PLAY_ONCE_AND_HOLD, 0, 60);
      }
      return;
    }
    if (this.state === "falling") {
      if (--this.stateCd < 0) this.stateCd = 0;
      this.y = (this.destY - 120) + 120 * ((10 - this.stateCd) / 10);
      this.syncPos();
      if (this.stateCd === 5) this.squashDamage();
      if (this.stateCd === 0) {
        const b = this.board;
        if (b.isPoolSquare(this.targetCol, this.row)) {
          try {
            const r = b.makeReanim("splash", this.x - 11, this.y + 20);
            r.loopType = PLAY_ONCE; // retail AllocReanimation default; full ~141-tick burst
            b.splashes.push({ reanim: r });
          } catch (e) { /* headless/def missing */ }
          b.sfx(["splat", "splat2", "splat3"][Math.floor(Math.random() * 3)]); // FOLEY_SPLAT
          b.sfx("zombiesplash", 1, 0); // SOUND_ZOMBIESPLASH, raw PlaySample (flat)
          this.die();
        } else {
          this.state = "done"; this.stateCd = 100;
          b.shake = 2; // ShakeBoard(1, 4): the port's updateFx consumes one
          // unit before the draw, so 2 renders the source's single tick
          // (same reason cherry's 3 renders 2).
          b.sfx("thump"); // FOLEY_THUMP (pitch 2, PITCH)
          b.spawnSquashDust(this.x + 40, this.y + ((b.bg === BG.ROOF || b.bg === BG.BOSS) ? 69 : 80));
        }
      }
      return;
    }
    if (this.state === "done") {
      if (--this.stateCd <= 0) this.die();
    }
  }
  // Plant::UpdateChomper (Plant.cpp:1763): READY bites @24 blend 20 (70t
  // fuse) -> resolve at 0: FOLEY_BIGCHOMP always, target RE-FOUND (FindTarget-
  // Zombie with CHOMPER_BITING +60 still live); garg/boss take 40 (0U) + SPLAT
  // and MISS; a null/re-missed target (immobilized, vaulting polevaulter,
  // bouncing pogo) MISSES; else the victim dies with loot (DieWithLoot) and
  // the bite anim plays out to its loop end (~96t) in MISSED/GOT_ONE ->
  // GOT_ONE plays anim_chew LOOP @15 while digesting 4000t -> swallow @12
  // blend 20 -> idle (blend 20, def fps 12). The bite anim is the attack: the
  // old code gulped normal zombies at trigger time and never played it.
  updateChomper() {
    if (this.state === "chew") {
      if (--this.stateCd <= 0) {
        this.state = "swallow";
        if (this.body.trackExists("anim_swallow")) this.body.playReanim("anim_swallow", PLAY_ONCE_AND_HOLD, 20, 12);
      }
      return;
    }
    if (this.state === "swallow" || this.state === "missed") {
      if (this.state === "swallow" && this.body.loopCount <= 0) return;
      if (this.state === "missed" && this.body.loopCount <= 0) return;
      this.state = "idle";
      if (this.body.trackExists("anim_idle")) this.body.playReanim("anim_idle", LOOP, 20, this.body.def.fps); // PlayIdleAnim(mDefinition->mFPS) (5269)
      return;
    }
    if (this.state === "gotone") {
      if (this.body.loopCount <= 0) return;
      this.state = "chew"; this.stateCd = 4000;
      if (this.body.trackExists("anim_chew")) this.body.playReanim("anim_chew", LOOP, 0, 15);
      // IsIZombieLevel animRate=0 (1829): no IZ mode in this port, noted.
      return;
    }
    if (this.state === "bite") {
      if (--this.stateCd > 0) return;
      this.resolveChomp();
      return;
    }
    // STATE_READY: the plant attack rect (x+80, 40w — GetPlantAttackRect 5218)
    // with the eating/biting +60 extension IS the whole gate (FindTargetZombie
    // 4876-4892); no extra hitX window exists in source.
    if (!this.zombieInFront()) return;
    this.stateCd = 70; this.state = "bite";
    if (this.body.trackExists("anim_bite")) this.body.playReanim("anim_bite", PLAY_ONCE_AND_HOLD, 20, 24);
  }
  // Plant::UpdateChomper BITING resolve (Plant.cpp:1777-1819).
  resolveChomp() {
    const b = this.board;
    b.sfx("bigchomp"); // FOLEY_BIGCHOMP (1779) — always, even on a miss
    const z = this.zombieInFront(); // re-find at resolve, BITING +60 live (1781)
    const big = !!z && (z.type === "garg" || z.type === "boss"); // 1785 (redeye unmodeled: no such type in scope)
    let miss = !z; // 1791
    if (z && !big) {
      // IsImmobilizied = iceTrap || buttered (6501): chomp victims must be
      // chewable — frozen ones make the bite whiff (1796).
      if (z.butter > 0 || z.iceTrap > 0) miss = true; // 1796
      // Vaulting polevaulters are unhittable mid-leap (1798-1802); the pogo
      // bounce phase needs no gate — pogo is a scope-dead teleport hop with
      // no airborne window in this port (L38+).
      else if (z.phase === "prevault" || z.phase === "invault") miss = true;
    }
    if (big) { // 1805-1809: armored giants take the 40 and the bite whiffs
      b.sfx(["splat", "splat2", "splat3"][Math.floor(Math.random() * 3)]); // FOLEY_SPLAT
      z.takeDamage(40, 0); // TakeDamage(40, 0U) — full shield->helm->body routing
      this.state = "missed";
    } else if (miss) { // 1811-1814: the bite anim plays out, then idle
      this.state = "missed";
    } else { // 1815-1818: devoured whole — award try + regular loot, no fall
      z.dieWithLoot();
      this.state = "gotone";
    }
    // No new anim here: the bite keeps playing to its loop end; MISSED and
    // GOT_ONE advance on loopCount above (1822-1848). (The old "gulp" foley
    // was invented — UpdateChomper plays only BIGCHOMP + the giant's SPLAT.)
  }
  updateDoom() {
    // Plant::UpdateDoomShroom (Plant.cpp:1584): NO proximity trigger — the
    // moment the (awake) shroom updates it enters DOINGSPECIAL with a
    // 100-tick fuse, anim_explode @23 (the 23-frame explode anim at 23fps =
    // exactly the 100-tick fuse), FOLEY_REVERSE_EXPLOSION, + shake overrides
    // on the head tracks (1598-1600). (The old proximity gate + 60t fuse +
    // "hmm" were invented.) DoSpecial (4367): raw SOUND_DOOMSHROOM sample
    // (flat), KillAllZombiesInRadius(250, 3 rows, burn, flags 127),
    // KillAllPlantsNearDoom (EVERY plant on the same col+row, incl. itself),
    // PARTICLE_DOOM at the center (RENDER_LAYER_TOP), AddACrater (18000),
    // ShakeBoard(3,-4), Die.
    if (!this.fuse) {
      this.fuse = 100; this.board.sfx("reverseExplosion");
      if (this.body.trackExists("anim_explode")) this.body.playReanim("anim_explode", PLAY_ONCE_AND_HOLD, 0, 23);
      this.body.setShakeOverride("DoomShroom_head1", 1.0);
      this.body.setShakeOverride("DoomShroom_head2", 2.0);
      this.body.setShakeOverride("DoomShroom_head3", 2.0);
    }
    if (--this.fuse > 0) return;
    this.board.sfx("doom");
    this.board.killAllZombiesInRadius(this.row, this.x + 40, this.y + 40, DOOM_RADIUS, 3, true, 127);
    this.board.killAllPlantsNearDoom(this.col, this.row);
    this.board.spawnDoom(this.x + 40, this.y + 40);
    this.board.addCrater(this.col, this.row);
    this.board.shake = 3;
    this.die();
  }
  updateIce() {
    // Plant::UpdateIceShroom (Plant.cpp:1604): NO proximity trigger — the
    // moment the (awake) shroom updates it enters STATE_DOINGSPECIAL with a
    // 100-tick fuse (the generic Plant::Update 2601-2606 ticks
    // mDoSpecialCountdown down into DoSpecial; the fuse below is that same
    // counter). DoSpecial (4407-4414): FOLEY_FROZEN, IceZombies (EVERY zombie
    // HitIceTrap + mIceTrapCounter = 300 + pool-sparkle resume + boss
    // fireball kill), PARTICLE_ICE_TRAP at the plant center (RENDER_LAYER_TOP),
    // Die. No plant anim and no shake (unlike doom/cherry — the ice case sets
    // neither).
    if (!this.fuse) this.fuse = 100;
    if (--this.fuse > 0) return;
    this.board.sfx("frozen"); // FOLEY_FROZEN (DoSpecial 4409)
    this.board.iceZombies(); // HitIceTrap loop + mIceTrapCounter = 300 (4249)
    this.board.spawnIceTrap(this.x + 40, this.y + 40); // PARTICLE_ICE_TRAP, TOP layer (4411)
    this.die();
  }
  // Plant::UpdateBlover (Plant.cpp): once the blow layer loops through, swap
  // to anim_loop LOOP (rate stays 20); when the 50-tick countdown hits 0 (and
  // not already blown), DoSpecial. Plant::DoSpecial blover branch: state =
  // DOINGSPECIAL + BlowAwayFliers (every non-dying PHASE_BALLOON_FLYING
  // zombie flags blowingAway — NOT row-limited, NOT killed on the spot —
  // + SOUND_BLOVER flat + mFogBlownCountDown = 4000).
  // Plant::UpdateAbilities then ticks the 200-init mDisappearCountdown down
  // into Die (death when ticked below 0, i.e. 201 ticks after the blow),
  // modeled as done/dieCd here.
  updateBlover() {
    // Plant::UpdateAbilities head: the DOINGSPECIAL disappear countdown
    // ticks before the machine below runs, so the blow tick itself never
    // decrements (death 201 ticks after the blow, like the 200->-1 source
    // curve).
    if (this.done && --this.dieCd <= 0) this.die();
    if (this.body.trackExists("anim_loop") && this.body.loopCount > 0 && this.body.loopType !== LOOP)
      this.body.playReanim("anim_loop", LOOP, 0, 20);
    if (this.state !== "doingspecial" && --this.stateCd <= 0) this.doSpecialBlover();
  }
  doSpecialBlover() {
    if (this.state === "doingspecial") return;
    this.state = "doingspecial"; // PlantState::STATE_DOINGSPECIAL
    for (const z of this.board.zombies) {
      // BlowAwayFliers IsDeadOrDying gate (Zombie::IsDeadOrDying 9597):
      // dead + dying + BURNED + mowed never blow (port idiom + phases).
      if (z.dead || z.gone || z.mowed || z.burnT > 0 || z.phase === "dying" || z.phase === "zdying") continue;
      if (z.phase === "flying") z.blowingAway = true; // PHASE_BALLOON_FLYING only — popped/falling balloons keep whatever flag they already have
    }
    this.board.sfx("blover"); // SOUND_BLOVER (BlowAwayFliers, flat PlaySample)
    this.board.fogBlown = 4000;
    this.done = true;
    this.dieCd = 201; // mDisappearCountdown 200 init, death when ticked below 0
  }
  // Plant::UpdateTanglekelp: idle finds a pool target (FindTargetZombie
  // PRIMARY — rangeFlags 5 cover submerged snorkels), grabs with FOLEY_FLOOP
  // + PoolSplash + the attached anim_grab vines (offsets per victim), then the
  // 100-tick countdown: 50 drags under (DragUnder + PoolSplash), 20 fires the
  // big splash + ENTERING_WATER, 0 kills (Die + target DieWithLoot).
  updateTangle() {
    const b = this.board;
    if (this.state !== "grabbing") {
      const z = this.findTargetZombie(this.row, Plant.damageRangeFlags(19, 0), 0);
      if (z) {
        b.sfx("floop"); // FOLEY_FLOOP
        this.state = "grabbing"; this.stateCd = 100;
        z.poolSplash(false);
        let vx = -13, vy = 15;
        if (z.type === "snorkel") { vx = -43; vy = 55; }
        if (z.phase === "ride") { vx = -20; vy = 37; }
        try {
          const g = b.makeReanim("Tanglekelp", z.x + vx, z.y + vy);
          if (g.trackExists("anim_grab")) g.playReanim("anim_grab", PLAY_ONCE_AND_HOLD, 0, 24);
          g.grabDX = vx; g.grabDY = vy;
          z.tangleFx = g;
        } catch (e) { /* headless/def missing */ }
        this.targetZombie = z;
      }
      return;
    }
    const z = this.targetZombie;
    const live = z && !z.dead && !z.gone;
    const present = z && !z.gone; // ZombieTryToGet non-null (Plant.cpp:1231/1253): dead-but-listed corpses still count
    if (this.stateCd === 50 && present) { z.dragUnder(); z.poolSplash(false); }
    if (this.stateCd === 20) {
      // Plant::UpdateTanglekelp (Plant.cpp:1242): the kill burst is its own
      // build — reanim at (mX-23,mY+7) @1.3 with the particle at (mX+31,mY+64)
      // (reanim+54,+57), NOT a PoolSplash (+37,+42 would land 17px left/15 up).
      b.poolSplash(this.x - 23, this.y + 7, 1.3, 1.3, 54, 57);
      b.sfx("enteringWater"); // FOLEY_ZOMBIE_ENTERING_WATER
    }
    if (this.stateCd === 0) {
      this.targetZombie = null;
      if (z && z.tangleFx) z.tangleFx.dead = true;
      if (z) z.tangleFx = null;
      this.die(); // Plant::Die kills the victim too (Plant.cpp:620-627)
      if (present) z.dieWithLoot(); // UpdateTanglekelp (Plant.cpp:1253-1257): unconditional on the corpse — dropLoot's droppedLoot guard makes a re-kill a no-op
      return;
    }
    // The vines ride the victim until the kill lands.
    if (live && z.tangleFx && !z.tangleFx.dead) {
      z.tangleFx.x = z.x + (z.tangleFx.grabDX || -13);
      z.tangleFx.y = z.y + (z.tangleFx.grabDY || 15);
      z.tangleFx.update();
    }
    if (this.stateCd > 0) this.stateCd--;
  }
  // Plant::UpdateMagnetShroom (Plant.cpp:2060): the steal machine. The flying
  // item eases toward the plant at 5%/tick while >20px out (top of the fn —
  // runs in every state). SUCKING (anim_shooting HOLD @12 + FOLEY_MAGNETSHROOM
  // at attract time, mStateCountdown 1500) flips to CHARGING on loop-through,
  // posing anim_nonactive_idle2 LOOP @2fps; CHARGING ends at countdown 0 with
  // anim_idle LOOP blend 30 @rand 10-15 and the item cleared. Otherwise the
  // scan below picks the closest stealable zombie. The old code was a
  // stand-in: a private 1200-tick repel timer (no such timer in source),
  // |x|-only range, and an instant silent stripMetal.
  updateMagnet() {
    const b = this.board;
    const it = this.magnetItem;
    if (it) {
      const dx = this.x + it.dx - it.x, dy = this.y + it.dy - it.y;
      if (dx * dx + dy * dy > 400) { it.x += dx * 0.05; it.y += dy * 0.05; } // Magnitude() > 20
    }
    if (this.stateCd > 0) this.stateCd--; // UpdateAbilities pre-dispatch tick (2565)
    if (this.state === "charging") {
      if (this.stateCd === 0) {
        this.state = "idle"; // STATE_READY
        if (this.body.trackExists("anim_idle")) this.body.playReanim("anim_idle", LOOP, 30, 10 + Math.random() * 5);
        this.magnetItem = null; // mMagnetItems[0].mItemType = NONE
      }
      return;
    }
    if (this.state === "sucking") {
      if (this.body.loopCount > 0) {
        if (this.body.trackExists("anim_nonactive_idle2")) this.body.playReanim("anim_nonactive_idle2", LOOP, 20, 2.0);
        this.state = "charging";
      }
      return;
    }
    let best = null, bd = 0;
    for (const z of b.zombies) {
      if (z.ally) continue; // mMindControlled
      if (!z.hasHead) continue;
      if (z.height !== "normal") continue; // HEIGHT_ZOMBIE_NORMAL (falls/drags/pool-transitions excluded)
      if (z.phase === "rising") continue; // PHASE_RISING_FROM_GRAVE
      if (z.dead || z.gone || z.mowed || z.burnT > 0 || z.phase === "zdying") continue; // IsDeadOrDying
      const rowDev = z.row - this.row;
      const zr = z.zombieRect();
      if (zr.x > BOARD_W || rowDev > 2 || rowDev < -2) continue;
      // Tunnel/stun/walk diggers and pogos are stealable only via the held
      // object (hasObject); everyone else needs a pail/football helm, a
      // door/ladder shield, or a running jack (2086-2110).
      if (z.type === "digger" && (z.phase === "tunnel" || z.phase === "digstun" || z.phase === "digwalk")) { if (!z.hasObject) continue; }
      else if (z.type === "pogo") { if (!z.hasObject) continue; }
      else if (!((z.type === "bucket" && z.helm > 0) || (z.type === "football" && z.helm > 0) ||
        (z.type === "door" && z.shield > 0) || (z.type === "ladder" && z.ladder > 0) ||
        (z.type === "jack" && z.phase === "running"))) continue;
      const r = z.eating ? 320 : 270; // mIsEating radius (mX, mY+20)
      if (!circleRectOverlap(this.x, this.y + 20, r, zr)) continue; // GetCircleRectOverlap
      const d = Math.hypot(this.x - zr.x, this.y - zr.y) + Math.abs(rowDev) * 80; // Distance2D + row penalty
      if (!best || d < bd) { best = z; bd = d; }
    }
    if (best) this.magnetAttract(best);
    // Placed-ladder steal (GRIDITEM_LADDER within chebyshev 2, GridItemDie +
    // MAGNET_ITEM_LADDER_PLACED): this port has no grid items (ladders live
    // on the carrier), so there is nothing to scan — noted.
  }
  // Plant::MagnetShroomAttactItem (Plant.cpp:1871): the steal. SUCKING +
  // 1500-tick countdown + FOLEY_MAGNETSHROOM, then per-type disarm with the
  // flying item spawned at the worn track (GetTrackPosition) and a
  // randomized plant-side rest offset. Item art is the stage-matching
  // sprite (damage index from armorStage, captured BEFORE zeroing the pool).
  magnetAttract(z) {
    const b = this.board;
    this.state = "sucking"; this.stateCd = 1500; // STATE_MAGNETSHROOM_SUCKING
    if (this.body.trackExists("anim_shooting")) this.body.playReanim("anim_shooting", PLAY_ONCE_AND_HOLD, 20, 12);
    b.sfx("magnetshroom"); // FOLEY_MAGNETSHROOM (pitch 2)
    const di = Math.min(2, Math.max(0, z.armorStage())); // GetHelm/ShielDamageIndex
    const rnd = (a) => (Math.random() * 20 - 10) + a; // RandRangeFloat(-10, 10) + a
    const tp = (name) => { // GetTrackPosition on the zombie body
      let x = z.x, y = z.y;
      try {
        const ti = z.body.findTrackIndex(name);
        if (ti >= 0) {
          const t = z.body.getCurrentTransform(ti);
          if (t && isFinite(t.x) && isFinite(t.y)) { x = z.body.x + t.x; y = z.body.y + t.y; }
        }
      } catch (e) { /* headless/def missing: zombie corner */ }
      return { x, y };
    };
    let type = MAGNET_NONE, x = 0, y = 0, dx = 0, dy = 0, art = null;
    if (z.type === "bucket" && z.helm > 0) {
      z.helm = 0; z.dropHelm(DMG_NOLEAVE); // mHelmHealth 0 + hide + hair (no debris: the helm flies to the shroom)
      const p = tp("anim_bucket");
      type = MAGNET_PAIL_1 + di;
      art = this.cropItemArt(z, "IMAGE_REANIM_ZOMBIE_BUCKET" + (1 + di));
      x = p.x - (art ? art.w : 0) / 2; y = p.y - (art ? art.h : 0) / 2;
      dx = rnd(25); dy = rnd(20);
    } else if (z.type === "football" && z.helm > 0) {
      z.helm = 0; z.dropHelm(DMG_NOLEAVE);
      const p = tp("zombie_football_helmet");
      type = MAGNET_FOOTBALL_1 + di;
      art = this.cropItemArt(z, ["IMAGE_REANIM_ZOMBIE_FOOTBALL_HELMET", "IMAGE_REANIM_ZOMBIE_FOOTBALL_HELMET2", "IMAGE_REANIM_ZOMBIE_FOOTBALL_HELMET3"][di]);
      x = p.x + 37; y = p.y - 60;
      dx = rnd(20); dy = rnd(20);
    } else if (z.type === "door" && z.shield > 0) {
      z.shield = 0; z.dropShield(DMG_NOLEAVE); // DetachShield (no debris)
      z.phase = "normal"; // PHASE_ZOMBIE_NORMAL
      if (!z.eating) z.startWalkAnim(0);
      const p = tp("anim_screendoor");
      type = MAGNET_DOOR_1 + di;
      art = this.cropItemArt(z, "IMAGE_REANIM_ZOMBIE_SCREENDOOR" + (1 + di));
      x = p.x - (art ? art.w : 0) / 2; y = p.y - (art ? art.h : 0) / 2;
      dx = rnd(30); dy = rnd(0);
    } else if (z.type === "ladder" && z.ladder > 0) {
      z.ladder = 0; z.dropShield(DMG_NOLEAVE); // DetachShield (phase + walk restart inside)
      type = MAGNET_LADDER_1 + di;
      art = this.cropItemArt(z, ["IMAGE_REANIM_ZOMBIE_LADDER_1", "IMAGE_REANIM_ZOMBIE_LADDER_1_DAMAGE1", "IMAGE_REANIM_ZOMBIE_LADDER_1_DAMAGE2"][di]);
      x = z.x + 31 - (art ? art.w : 0) / 2; y = z.y + 20 - (art ? art.h : 0) / 2;
      dx = rnd(30); dy = rnd(0);
    } else if (z.type === "pogo" && z.hasObject) {
      // MagnetShroomAttactItem POGO (Plant.cpp:1871): PogoBreak(16U) (no
      // debris: the stick flies to the shroom), then the stick-track read
      // with LADDER_5-centered offsets (+40/+84, rest +30/+0) and POGO_1 /
      // POGO_3 by hasArm (POGO_2 is never produced). Retail flies
      // IMAGE_ZOMBIEPOGO cels (retail-only art, absent from the user files);
      // the port composes the victim's own posed stick tracks instead,
      // damage overrides included. The stick art only exists in the
      // bounce-layer frames (idle/walk carry frame -1), so the read rides a
      // temporary anim_pogo pose — restored before the break, value-identical
      // to a post-break read (no reanim tick runs between).
      const b = z.body;
      const sv = { fs: b.frameStart, fc: b.frameCount, at: b.animTime, lt: b.loopType, lc: b.loopCount, lf: b.lastFrameTime };
      if (b.trackExists("anim_pogo")) b.setFramesForLayer("anim_pogo");
      const p = tp("Zombie_pogo_stick");
      let stick = null;
      try { stick = b.poseComposite(["Zombie_pogo_stick", "Zombie_pogo_stick2", "Zombie_pogo_stick3", "Zombie_pogo_stickhands"]); } catch (e) { stick = null; }
      b.frameStart = sv.fs; b.frameCount = sv.fc; b.animTime = sv.at; b.loopType = sv.lt; b.loopCount = sv.lc; b.lastFrameTime = sv.lf;
      z.pogoBreak(DMG_NOLEAVE);
      let lw = 77, lh = 121; // IMAGE_REANIM_ZOMBIE_LADDER_5 (source centering art)
      try {
        const lr = this.board.libs.getReanim("Zombie_ladder").images.get("IMAGE_REANIM_ZOMBIE_LADDER_5");
        if (lr && lr.w > 0 && lr.h > 0) { lw = lr.w; lh = lr.h; }
      } catch (e) { /* ladder def missing: keep 77x121 */ }
      type = z.hasArm ? MAGNET_POGO_1 : MAGNET_POGO_3;
      art = stick && stick.img ? { cv: stick.img, w: stick.img.width, h: stick.img.height } : null;
      x = p.x + 40 - lw / 2; y = p.y + 84 - lh / 2;
      dx = rnd(30); dy = rnd(0);
    } else if (z.type === "jack" && z.phase === "running") {
      z.stopJackSong(); // StopZombieSound
      z.pickRandomSpeed();
      z.phase = "normal"; // PHASE_ZOMBIE_NORMAL
      z.body.assignRenderGroupToPrefix("Zombie_jackbox_box", RENDER_GROUP_HIDDEN);
      z.body.assignRenderGroupToPrefix("Zombie_jackbox_handle", RENDER_GROUP_HIDDEN);
      const p = tp("Zombie_jackbox_box");
      type = MAGNET_JACK;
      art = this.cropItemArt(z, "IMAGE_REANIM_ZOMBIE_JACKBOX_BOX");
      x = p.x - (art ? art.w : 0) / 2; y = p.y - (art ? art.h : 0) / 2;
      dx = rnd(20); dy = rnd(15);
    } else if (z.type === "digger" && z.hasObject) {
      z.diggerLoseAxe(); // never the hardhat — the helm pool stays for peas
      const p = tp("Zombie_digger_pickaxe");
      type = MAGNET_PICK_AXE;
      art = this.cropItemArt(z, "IMAGE_REANIM_ZOMBIE_DIGGER_PICKAXE");
      x = p.x - (art ? art.w : 0) / 2; y = p.y - (art ? art.h : 0) / 2;
      dx = rnd(45); dy = rnd(15);
    } else return; // scan-gated; unreachable
    this.magnetItem = art ? { type, x, y, dx, dy, img: art.cv, w: art.w, h: art.h } : null;
  }
  // Crop a standalone item sprite out of a loaded atlas def
  // (DrawMagnetItems draws IMAGE_* cels; the map rects give w/h for the
  // GetWidth/GetHeight centering). Sync — returns null when the def, key,
  // or atlas pixels aren't available (headless/before-load).
  static cropDefImage(def, key) {
    try {
      const rc = def.images.get(key);
      if (!rc || !(rc.w > 0) || !(rc.h > 0) || !def.atlas || !def.atlas.width) return null;
      const cv = document.createElement("canvas");
      cv.width = rc.w; cv.height = rc.h;
      cv.getContext("2d").drawImage(def.atlas, rc.x, rc.y, rc.w, rc.h, 0, 0, rc.w, rc.h);
      return { cv, w: rc.w, h: rc.h };
    } catch (e) { return null; }
  }
  // Crop a standalone item sprite out of the victim's own atlas
  // (DrawMagnetItems draws IMAGE_* cels; the map rects give w/h for the
  // GetWidth/GetHeight centering).
  cropItemArt(z, key) {
    try { return Plant.cropDefImage(z.body.def, key); }
    catch (e) { return null; }
  }
  // Plant::DrawMagnetItemsOnTop (Plant.cpp:1716): zombie items render TOP
  // while the flight vector is still >20px out (the settled item hides —
  // absorbed into the shroom until CHARGING ends).
  drawMagnetItemsOnTop() {
    const it = this.magnetItem;
    if (!it) return false;
    const dx = this.x + it.dx - it.x, dy = this.y + it.dy - it.y;
    return dx * dx + dy * dy > 400;
  }
  // Plant::UpdateGraveBuster (Plant.cpp:1096): LANDING waits for the land
  // anim's first loop, then idles @10,12 with a 400-tick countdown, EATING,
  // and the attached PARTICLE_GRAVE_BUSTER; at 0 the stone dies
  // (GridItemDie + mGravesCleared), the DIE burst fires, and the plant Dies
  // after dropping regular loot (DropLootPiece at mX+40,mY, factor 12).
  updateGravebuster() {
    const cell = this.board.cell(this.col, this.row);
    if (this.state === "landing") {
      if (!cell || !cell.grave) { this.die(); return; }
      if (this.body.loopCount > 0) {
        if (this.body.trackExists("anim_idle")) this.body.playReanim("anim_idle", LOOP, 10, 12);
        this.stateCd = 400;
        this.state = "eating";
        this.board.spawnGraveBuster(this.x + 40, this.y + 40, this.row);
      }
      return;
    }
    if (this.state === "eating") {
      // USER OVERRIDE of Plant::UpdateReanim 2795 (TodAnimateCurveFloat 0->30
      // LINEAR): the buster proper slides 0->85px down over the 400-tick
      // countdown while its dirt ring stays pinned at the grave floor (the
      // ring track is hidden; main.js draws it fixed + clips the buster at
      // the ring floor, so the buster visibly sinks INTO the dirt and is
      // just buried the tick the stone dies).
      this.sinkY = 85 * (400 - this.stateCd) / 400;
      if (--this.stateCd > 0) return;
      if (cell && cell.grave) {
        cell.grave = null; // GridItem::GridItemDie
        this.board.gravesCleared++;
      }
      this.board.spawnGraveBusterDie(this.x + 40, this.y + 40, this.row);
      this.board.dropLootRoll(this.x, this.y, 12);
      this.die();
    }
  }
  updateCoffee() {
    // Plant::UpdateCoffeeBean (Plant.cpp:1642-1652): the bean dies when the
    // crumble loops through. (The cast itself ran at plant time, above.)
    if (this.body.loopCount > 0 || --this.dieCd <= 0) this.die();
  }
  // Plant::SetSleeping (Plant.cpp:510-579) — pose swap half. In-play sleep
  // forces the anim_sleep layer when the def has one (sea-shroom does);
  // wake restores anim_idle, re-rolling 10-15fps when the body idled below
  // 2fps (569-578). The Zzz rides alongside via makeSleepReanim.
  setSleeping(on) {
    if (this.sleeping === on) return; // 512 (carried plants keep their sleep flag — the update gate skips them either way)
    this.sleeping = on;
    if (on) {
      // Plant::SetSleeping 551-554: StartBlend(20) + layer swap preserving
      // mAnimTime (playReanim resets it via setFramesForLayer, so save and
      // restore around the swap).
      const at = this.body.animTime;
      if (this.body.trackExists("anim_sleep")) this.body.playReanim("anim_sleep", LOOP, 20, this.idleRate);
      else this.body.animRate = 1;
      this.body.animTime = at;
      this.makeSleepReanim(); // fresh Zzz each sleep (AddReanimation 527-531)
      this.endBlink(); // EndBlink (561)
    } else {
      // Plant::SetSleeping 569-578: same preserve on the way back; a body
      // idled down below 2fps re-rolls a fresh 10-15 rate in play.
      const at = this.body.animTime;
      if (this.body.trackExists("anim_idle")) this.body.playReanim("anim_idle", LOOP, 20, this.idleRate);
      this.body.animTime = at;
      if (this.body.animRate < 2) this.body.animRate = 10 + Math.random() * 5;
      this.sleepReanim = null; // RemoveReanimation (533-535)
    }
  }
  // Plant::SetSleeping Zzz half (Plant.cpp:516-532): (re)builds the floating
  // Z reanim (REANIM_SLEEPING). Null when the def isn't loaded (headless).
  makeSleepReanim() {
    this.sleepReanim = null;
    try {
      // Plant::SetSleeping 518-525: generic (mX+50, mY+40); fume +12x,
      // scaredy -20y, gloom -12y. Sea-shroom takes the generic anchor.
      let ox = 50, oy = 40;
      if (this.seed === 10) ox += 12;
      else if (this.seed === 13) oy -= 20;
      else if (this.seed === 31) oy -= 12;
      const r = this.board.makeReanim("Z", this.x + ox, this.y + oy);
      r.animRate = 6 + Math.random() * 2; // RandRangeFloat(6, 8)
      r.animTime = Math.random() * 0.9; // RandRangeFloat(0, 0.9)
      this.sleepReanim = r;
    } catch (e) { /* headless/def missing: sleep pose still shows */ }
  }
  updateMarigold() {
    // Marigold shares UpdateProductionPlant (Plant.cpp:2589) — same 100-tick
    // pre-drop glow on its own head-only channel (see updateProducer) and
    // same RandRangeInt(rate-150, rate) cadence (1024); only the drop differs
    // (10% gold else silver, COIN_MOTION_COIN 1049). Same HasLevelAwardDropped
    // gate (999), plus the marigold wind-down (1002-1011): once the final wave
    // has spawned (mCurrentWave == mNumWaves) it enters MARIGOLD_ENDING with
    // a 6000-tick countdown — ticked in UpdateAbilities ahead of dispatch, so
    // the decrement-then-check order here — and stops when it expires.
    if (this.board.hasLevelAwardDropped()) return;
    if (this.board.currentWave === this.board.numWaves) {
      if (!this.ending) { this.ending = true; this.endingT = 6000; }
      else if (--this.endingT <= 0) return;
    }
    if (--this.produceCd <= 100) {
      const glow = 100 - this.produceCd;
      if (glow > 0) this.glow = Math.max(this.glow, glow);
    }
    if (this.produceCd > 0) return;
    this.produceCd = (2500 - 150) + Math.floor(Math.random() * 151);
    this.board.addCoin(this.x + 20, this.y, Math.random() < 0.1 ? "gold" : "silver");
    // No launch sting: silver/gold spawn silently (CoinInitialize
    // PlayLaunchSound only chimes diamond/chocolate/presents — and the
    // diamond chime rides the Coin ctor, never the spawner).
  }
  updateHypno() { /* passive: converts on bite (handled in zombie EatPlant) */ }
  updateSpike() {
    // Plant::UpdateSpikeweed (Plant.cpp:460340): the trigger fires on the
    // PRIMARY-weapon scan (FindTargetZombie: attack rect + DR_GROUND gate —
    // exactly what zombieInFront() runs for seed 21). SpikeweedAttack poses
    // anim_attack PLAY_ONCE_AND_HOLD blend 20 @18 + raw PlaySample
    // (SOUND_THROW, flat) and runs a 100-tick countdown; the single 20-dmg
    // DoRowAreaDamage(20, 33U) lands at countdown 75 (1297). At 0 the state
    // returns to NOTREADY but the attack pose HOLDS until the anim finishes
    // (loopCount > 0 → PlayIdleAnim blend 20 @12-15), so a standing victim
    // re-triggers and the chomp never snaps to idle mid-bite (attack is 9
    // frames @18fps = 50 ticks, inside the countdown).
    if (this.state === "attacking") {
      if (--this.stateCd <= 0) { this.state = "idle"; this.stateCd = 0; }
      else if (this.stateCd === 75) {
        // Plant::DoRowAreaDamage (Plant.cpp:45ED00): same-row + high-ground
        // match (roof/pot height — unmodeled, no roof levels in scope),
        // DR_GROUND effected gate (NOT the 33U damage flags: dying/mind-
        // controlled/flying/submerged/underground/off-ground zombies are
        // excluded), strict X-overlap (> 0, edge-touch doesn't count) of the
        // PRIMARY attack rect ([mX+20, mX+50]) with the zombie rect.
        // Zambonis and catapults take 1800 and consume the spikeweed
        // (Die, no loot — spikerock's SpikeRockTakeDamage is N/A, no
        // spikerock seed in scope). Every connected hit plays FOLEY_SPLAT
        // (set-pick, inside the loop).
        const RF = Plant.damageRangeFlags(21, 0); // DR_GROUND
        const ar = Plant.attackRect(21, this.x, this.y, this.w, this.h);
        for (const z of this.board.zombies) {
          const rowDev = z.type === "boss" ? 0 : z.row - this.row;
          if (rowDev !== 0) continue;
          if (!z.effectedByDamage(RF)) continue;
          const zr = z.zombieRect();
          if (getRectOverlap(ar.x, ar.w, zr.x, zr.w) <= 0) continue;
          let dmg = 20;
          if (z.type === "zamboni" || z.type === "catapult") {
            dmg = 1800;
            this.die();
          }
          z.takeDamage(dmg, DMG_BYPASS | DMG_SPIKE);
          this.board.sfx(["splat", "splat2", "splat3"][Math.floor(Math.random() * 3)]);
        }
      }
      // UpdateSpikeweed (1292): the idle pose returns when the attack anim
      // completes (mLoopCount > 0 → PlayIdleAnim @12-15), not when the
      // countdown ends. playReanim resets loopCount, so this fires once per
      // anim completion, exactly like the source (which re-rolls 12-15 on
      // every idle loop the same way).
      if (this.body.loopCount > 0) {
        if (this.body.trackExists("anim_idle")) this.body.playReanim("anim_idle", LOOP, 20, 12 + Math.random() * 3);
      }
      return;
    }
    // SpikeweedAttack (Plant.cpp:460340): state-guarded (no retrigger while
    // attacking); the throw sfx is a raw PlaySample(SOUND_THROW)
    // (Plant.cpp:1270), so it holds the sample flat with pitch 0.
    if (this.zombieInFront()) { // FindTargetZombie PRIMARY (1305)
      this.state = "attacking"; this.stateCd = 100;
      if (this.body.trackExists("anim_attack")) this.body.playReanim("anim_attack", PLAY_ONCE_AND_HOLD, 20, 18);
      this.board.sfx("throw", 1, 0); // PlaySample(SOUND_THROW) (1270)
    }
  }
  drawFlash() { return this.flash > 0; }
  die() {
    // Plant::Die (Plant.cpp:620-627): a dying tangle kelp takes its victim
    // with it — DieWithLoot on the grabbed zombie, whether the plant dies
    // from the kill countdown, a shovel, a bite or a squash. (DieWithLoot →
    // dropLoot is guarded by droppedLoot, so the countdown-0 call below
    // re-firing it right after is a safe no-op, exactly like the source
    // calling Die() then DieWithLoot back to back.)
    if (this.seed === 19 && this.board && this.targetZombie && !this.targetZombie.gone) {
      this.targetZombie.dieWithLoot();
    }
    this.dead = true;
    if (this.targetZombie && this.targetZombie.tangleFx) { this.targetZombie.tangleFx.dead = true; this.targetZombie.tangleFx = null; }
    this.targetZombie = null;
  }
}

// ---- source movement/animation model (Zombie.cpp) ----
// Per-tick locomotion is ground-locked: UpdateZombieWalking advances the
// zombie by its _ground track velocity at the current anim rate, and
// UpdateAnimSpeed sets that rate from the zombie's own velocity:
//   rate = velX * (walkFrames / groundDist) * 47 / scale
// Our reanim defs carry real _ground tracks, so both the per-individual
// speed spread and the matching walk-cycle speed come out of one formula.
// Eating forces 36 fps (20 for the small-chew list), chill halves the rate,
// butter/ice-trap freezes it at 0. Movement falls back to raw velX for the
// reanims without _ground (zamboni drive, catapult walk) exactly like the
// source's TrackExists("_ground") branches.
const WALK_GROUND_K = 47; // the 47.0f in UpdateAnimSpeed
const CHILL_FACTOR = 0.5; // CHILLED_SPEED_FACTOR: chill halves speed+anim
const EAT_RATE = 36, EAT_RATE_SMALL = 20; // UpdateAnimSpeed eating rates
const SMALL_EATERS = new Set(["pole", "balloon", "imp", "digger", "jack", "snorkel", "yeti"]);
const BUTTER_TICKS = 400; // ApplyButter mButteredCounter
// Board::GetPosYBasedOnRow (Board.cpp:4098): the zombie ground-line Y of a
// row. Roof slopes with the zombie's own X (continuous); other stages use
// the flat row top. Zombie::GetPosYBasedOnRow (Zombie.cpp:7951) trails it
// by 30 (balloon -30 more, pogo -16 more) — that IS mPosY.
export function posYOnRow(bg, posX, row) {
  const base = gridToPixelY(8, row, bg);
  if (bg === BG.ROOF || bg === BG.BOSS) return base + Math.max(0, (440 - posX) * 0.25);
  return base;
}
export function zombieRowY(bg, mPosX, row, type) {
  let y = posYOnRow(bg, mPosX + 40, row) - 30;
  if (type === "balloon") y -= 30;
  else if (type === "pogo") y -= 16;
  return y;
}
// Zombie::UpdateDeath body-thud times (Zombie.cpp:9075-9166): the fallTime
// timed event at which FOLEY_ZOMBIE_FALLING fires during the death fall.
// -1 = none (types with no death-fall sound in source). Normal-likes use
// the base 0.77 branch — source picks 0.788/0.71 when the superlongdeath or
// death2 layer is the one playing, but our die() always plays the base
// anim_death layer, so the base time applies. Garg (0.86 + THUMP) has no
// thump asset and is out of L1-9 scope; boss stingers unmodeled.
export function zombieFallTime(z) {
  switch (z.type) {
    case "pole": case "balloon": case "yeti": return 0.68;
    case "football": return 0.52;
    case "news": return 0.63;
    case "dancer": case "backup": return 0.83;
    case "bobsled": return 0.81;
    case "jack": return 0.64;
    case "pogo": return 0.84;
    case "digger": return 0.85;
    case "ladder": return 0.62;
    case "snorkel": case "zamboni": case "dolphin": case "bungee":
    case "catapult": case "imp": case "boss": case "garg": return -1;
    default: return 0.77; // normal/flag/cone/bucket/door/ducky
  }
}
// Zombie::GetDrawPos image-offset table (Zombie.cpp:5874): per-type reanim
// nudge folded into UpdateReanim's SetPosition.
export const ZOMBIE_DRAW_OFFSETS = {  normal: [0, 0], flag: [0, 0], cone: [0, 0], bucket: [0, 0], news: [0, 0],
  door: [0, 0], dancer: [0, 0], backup: [0, 0], ducky: [0, 0], ladder: [0, 0],
  imp: [0, 0], garg: [0, -8], yeti: [0, -20], bobsled: [0, -12],
  football: [0, -16], catapult: [-25, -18], pogo: [0, 16], balloon: [0, 17],
  pole: [-6, -11], zamboni: [68, -23], digger: [0, 0], jack: [0, 0], snorkel: [0, 0],
  bungee: [-18, 0],
};
// Zombie::DrawShadow anchor (Zombie.cpp:9346) + TodDrawImageCenterScaledF
// anchor rule (TodCommon.cpp:842): the helper puts the blob's natural CENTER
// at (formula + 43, formulaY + 18) at ANY scale — the scale-1 fast path draws
// the 86x36 image top-left exactly at the formula point. So the dx/dy below
// are the raw formula values (an image-corner anchor, NOT a blob center);
// main.js adds the (43,18) center offset at draw time. The dx/dy include the
// GetDrawPos per-type image nudge (Zombie.cpp:5874-5907), which is
// DrawShadow's base (9349-9355) — the body rides the same nudge in syncBody.
// Order mirrors the source: scale*20-20 uses the pre-imp/garg scale, the
// news/balloon extras apply after the type branch, altitude rides along when
// airborne (rising/falling/vaulting/balloon/pogo — altitude is 0 in sim
// today, so those terms are currently no-ops).
export function zombieShadowSpec(type, o = {}) {
  const s0 = o.scale ?? 1, back = !!o.backwards;
  const bodyY = -(o.altitude | 0);
  let s = s0, dx = s0 * 20 - 20, dy = bodyY;
  // Zombie::GetDrawPos type table (Zombie.cpp:5874-5907): DrawShadow's base
  // is mImageOffsetX/Y + mBodyY (9349-9355), so the shadow rides the same
  // type nudge as the body. Retail's +16 football / +11 pole shadow terms
  // cancel these, pinning the blob to the ground; without them the shadow
  // sat 16/11px below the feet.
  dx += ({ catapult: -25, pole: -6, zamboni: 68, bungee: -18 })[type] ?? 0;
  dy += ({ garg: -8, yeti: -20, bobsled: -12, football: -16, catapult: -18,
    pogo: 16, balloon: 17, pole: -11, zamboni: -23 })[type] ?? 0;
  const either = (fwd, bwd) => (back ? bwd : fwd);
  if (type === "football") { dx += either(20 + 21 * s0, -11 * s0); dy += 16; }
  else if (type === "news") dx += either(29, 5);
  else if (type === "pole") { dx += either(36, -5); dy += 11; }
  else if (type === "bobsled") { dx += either(20, 13); dy += 13; }
  else if (type === "imp") { s *= 0.6; dx += either(25, 13); dy += 7; }
  else if (type === "digger") { dx += either(17, 14); dy += 5; }
  else if (type === "snorkel") { dx += either(35, -2); dy += 5; }
  else if (type === "dolphin") { dx += either(19, 15); dy += 11; }
  else if (type === "yeti") { dx += either(3, 20); dy += 20; }
  else if (type === "garg") { s *= 1.5; dx += 27; dy += 7; }
  else if (type === "bungee") {
    // Zombie::DrawShadow bungee branch (Zombie.cpp:9508-9512): offsetX -12 and
    // the descent scale curve TodAnimateCurveFloat(2000,100,alt,0.1,1.5,LINEAR)
    // — the blob grows as the zombie drops. The +altitude ride comes from the
    // airborne flag at the call site (9514-9517).
    dx -= 12;
    const a = o.altitude | 0;
    const t = Math.max(0, Math.min(1, (a - 2000) / (100 - 2000)));
    s *= 0.1 + t * 1.4;
  }
  else dx += either(23, 11); // every in-scope type has a body reanim
  if (type === "news") dy += 4;
  else if (type === "balloon") dy += 13;
  if (o.airborne) dy += (o.altitude | 0);
  return { dx, dy, s };
}

// ---- Wall-nut Bowling rollers (Plant::UpdateBowling, Plant.cpp:2380-2529) ----
// Bowling nuts are NOT cell plants: they roll freely (mX/mY continuous, row
// changes on bounce), render at RENDER_LAYER_PROJECTILE, and zombies never
// target them (GetPlantsOnLawn returns empty on bowling levels). Our port
// keeps them in Board.bowlers (not Board.cells) for the same reason.
// seed: 3 = wall-nut, 41 = explode-o-nut (retail 49). state starts NOTREADY
// (the Plant ctor's mState): the nut rolls straight with no drift and no row
// changes until its first hit, which picks the bounce direction
// (Plant.cpp:2396-2528); launchCounter counts wall-nut hits for the
// escalating coin drops (Plant.cpp:2472-2498).
export class Bowler {
  constructor(board, seed, col, row) {
    this.id = NEXT_ID++;
    this.board = board; this.seed = seed;
    this.col = col; this.row = row;
    // Render band (Plant::UpdateBowling 2517-2528): mRenderOrder is recomputed
    // asymmetrically on row steps — AFTER row-- going up, BEFORE row++ going
    // down — so a down-weaving nut keeps the band of the row it just left and
    // slides BEHIND that row's and its own lane's zombies (PROJECTILE band of
    // the upper row still loses to both rows' ZOMBIE bands), while up-weaving
    // and straight nuts ride their own row's PROJECTILE band in front. The
    // draw pass bands by renderRow to match.
    this.renderRow = row;
    // PlantInitialize: mX/mY start at the grid corner (like NewPlant).
    this.x = gridToPixelX(col, board.bg);
    this.y = gridToPixelY(col, row, board.bg);
    this.w = 80; this.h = 80;
    this.state = "notready"; // Plant ctor mState: straight roll until first hit
    this.launchCounter = 0;
    this.dead = false;
    // PlantInitialize 150-157: bowling plants play _ground (not anim_idle) at
    // 12-18fps (wallnut/explode) — giant (challenge-only, unported) 6-10fps.
    this.body = board.makeReanim("Wallnut", this.x, this.y);
    try {
      if (this.body.trackExists("_ground")) {
        this.body.playReanim("_ground", LOOP, 0, 12 + Math.random() * 6);
      } else if (this.body.trackExists("anim_idle")) {
        this.body.playReanim("anim_idle", LOOP, 0, 12 + Math.random() * 6);
      }
    } catch (e) { /* headless without def */ }
    // Explode-o-nut red tint (PlantInitialize 273, UpdateReanimColor 2696):
    // Color(255,64,64) multiply. Our reanim has no colorize path, so bake a
    // red-tinted atlas clone once per board (shared across its explode nuts).
    if (seed === 41) {
      try {
        const red = board.getExplodeDef();
        if (red) this.body.def = red;
      } catch (e) { /* fall back to untinted */ }
    }
  }
  get mX() { return this.x; }
  get mY() { return this.y; }
  get mWidth() { return this.w; }
  get mHeight() { return this.h; }
  // Plant::GetPlantAttackRect bowling branch (5206-5209):
  // Rect(mX, mY, mWidth-20, mHeight).
  attackRect() { return [this.x, this.y, 60, 80]; }
  // Plant::FindTargetZombie for the bowling row (4817-4953, simplified to
  // the L5-relevant checks): same row (boss hits from any row), alive,
  // non-digging, non-ally, effected (no bungee/dropping), X-overlap >= 0,
  // explode skips pole-vaulters mid-vault. Nearest (smallest zombie X) wins.
  findTarget() {
    const b = this.board;
    const [ax, , aw] = this.attackRect();
    let best = null;
    for (const z of b.zombies) {
      if (z.dead || z.gone || z.mowed || z.ally || z.phase === "tunnel" || z.held) continue;
      if (z.type === "bungee" && !z.bungeeOnLawn()) continue; // divers fail effectedByDamage anyway; landed bottom is hittable like source
      if (z.type !== "boss" && z.row !== this.row) continue;
      if (this.seed === 41 && z.phase === "invault") continue; // explode skips vaulting poles
      const zx = z.hitX(), zw = z.hitW();
      const lo = Math.max(zx, ax), hi = Math.min(zx + zw, ax + aw);
      if (hi - lo < 0) continue;
      if (!best || zx < best.hitX()) best = z;
    }
    return best;
  }
  update() {
    const b = this.board;
    if (this.dead) return;
    this.body.update();
    // UpdateBowling 2382-2394: roll via the _ground track velocity
    // (mX -= speed; giant x2 — giant is challenge-only, unported).
    // Negative _ground velocity rolls right (toward the zombies).
    try {
      if (this.body.trackExists("_ground") && this.body.frameCount > 0) {
        const v = this.body.getTrackVelocity("_ground") * (this.body.scaleX || 1);
        this.x -= v;
        if (this.x > 800) { this.dead = true; return; }
      } else {
        this.x += 1.2; // fallback if the def lacks _ground
        if (this.x > 800) { this.dead = true; return; }
      }
    } catch (e) { this.x += 1.2; if (this.x > 800) { this.dead = true; return; } }
    // The reanim draws at body.x/body.y (Plant::Draw uses mX/mY) — ride them.
    this.body.x = this.x; this.body.y = this.y;
    // UpdateBowling 2396-2428: vertical drift (none while NOTREADY — the
    // fresh nut rolls straight), then the lane-alignment gate: misaligned
    // ticks roll on in X but can't hit or change rows. The row step below
    // runs on EVERY aligned tick (not just hits), so the row tracks the
    // drift as the nut weaves diagonally between hits.
    if (this.state === "up") this.y -= 2;
    else if (this.state === "down") this.y += 2;
    const wantY = gridToPixelY(0, this.row, b.bg);
    const dist = wantY - this.y;
    if (dist < -2 || dist > 2) return;
    // Lane-edge clamp (2408-2416): bounce off the top/bottom rows.
    let next = this.state;
    if (this.state === "up" && this.row <= 0) next = "down";
    else if (this.state === "down" && this.row >= 4) next = "up";
    const z = this.findTarget();
    if (z) {
      const px = this.x + this.w / 2, py = this.y + this.h / 2;
      if (this.seed === 41) {
        // Explode-o-nut (2424-2436): cherry sfx + bowlingimpact2, 90px /
        // 1-row burn AOE (theBurn = true, like cherry — victims char), flags
        // = GetDamageRangeFlags | 32U (SPIKE bit), PARTICLE_POWIE at the nut
        // (AddTodParticle 2431, same system as cherry), shake (3,-4),
        // self-destruct.
        b.sfx("cherry"); b.sfx("bowlingimpact2");
        b.killAllZombiesInRadius(this.row, px, py, 90, 1, true, 1 | 32);
        b.spawnPowie(px, py);
        b.shake = 3;
        this.dead = true;
        return;
      }
      // Wall-nut hit (2439-2470): bowlingimpact + shake, then pool-targeted
      // damage — door shields take full body damage once the nut has bounced
      // (mState != NOTREADY, i.e. every hit after the first — 2446); other
      // shields take 400 shield-only; helms take 900 helm-only (+pail/plastic
      // foley); otherwise 1800 body.
      b.sfx("bowlingimpact");
      b.shake = 1;
      const hasDoor = this.state !== "notready" && z.type === "door" && (z.shield > 0 || z.ladder > 0);
      const hasShield = z.type === "door" ? (z.shield > 0) : z.type === "news" ? (z.paper > 0) : z.type === "ladder" ? (z.ladder > 0) : (z.shield > 0);
      if (hasDoor) z.takeBodyDamage(1800, 0);
      else if (hasShield) z.takeShieldDamage(400, 0);
      else if (z.helm > 0) {
        if (z.type === "bucket") b.sfx(Math.random() < 0.5 ? "shieldhit" : "shieldhit2");
        else if (z.type === "cone" || z.type === "football") b.sfx(Math.random() < 0.5 ? "plastichit" : "plastichit2");
        z.takeHelmDamage(900, 0);
      } else z.takeBodyDamage(1800, 0);
      // Escalating coin drops (2472-2498): wall-nut only, replay or past L10.
      if (this.seed === 3 && (!b.firstTime || b.level > 10)) {
        this.launchCounter++;
        const drop = (dx, kind) => b.addCoin(px + dx, py, kind);
        if (this.launchCounter === 2) { b.sfx("points"); drop(0, "silver"); }
        else if (this.launchCounter === 3) { b.sfx("points"); drop(-5, "silver"); drop(5, "silver"); }
        else if (this.launchCounter === 4) { b.sfx("points"); drop(-10, "silver"); drop(0, "silver"); drop(10, "silver"); }
        else if (this.launchCounter >= 5) { b.sfx("points"); drop(0, "gold"); }
      }
      // Bounce (2500-2514): edges force inward, otherwise randomize.
      // (Giant is challenge-only, unported.)
      if (this.row === 4 || this.state === "down") next = "up";
      else if (this.row === 0 || this.state === "up") next = "down";
      else next = Math.random() < 0.5 ? "up" : "down";
    }
    // Row step (2517-2528): follows the drift every aligned tick — including
    // no-hit ticks — and adopts the bounce direction after a hit. (NOTREADY
    // nuts roll straight: next is "notready", neither branch runs.) The order
    // recompute is asymmetric: AFTER row-- going up (band = new row), BEFORE
    // row++ going down (band = old row — the nut draws a band early until its
    // next row change, tucking behind both lanes' zombies while weaving down).
    if (next === "up") {
      this.row--; this.state = "up";
      this.renderRow = this.row;
      if (this.row < 0) { this.row = 0; this.renderRow = 0; this.state = "down"; }
    } else if (next === "down") {
      this.state = "down";
      this.renderRow = this.row;
      this.row++;
      if (this.row > 4) { this.row = 4; this.renderRow = 4; this.state = "up"; }
    }
  }
}

export class Zombie {
  constructor(board, type, row, wave) {
    const r = ROSTER[type];
    this.id = NEXT_ID++;
    this.board = board; this.type = type; this.row = row; this.wave = wave;
    // ZombieInitialize (Zombie.cpp:100): variant = !Rand(5) — tongue zombies.
    this.variant = Math.random() < 0.2;
    // AddZombieInRow: mPosX = 780 + Rand(40) (ZOMBIE_START_RANDOM_OFFSET).
    this.x = ZOMBIE_SPAWN_X + Math.floor(Math.random() * SPAWN_RAND); // 780 + Rand(40) integer
    // Zombie::ZombieInitialize: mPosY trails the lane ground line by 30.
    this.y = zombieRowY(board.bg, this.x, row, type);
    this.altitude = 0; this.scaleZombie = 1;
    this.hp = r.hp;
    this.helm = r.helm | 0; this.shield = r.shield | 0; this.paper = r.paper | 0; this.ladder = r.ladder | 0;
    // ZombieInitialize (Zombie.cpp:792-799): on Little Trouble levels every
    // on-board zombie (street-preview zombies ride ZOMBIE_WAVE_CUTSCENE, which
    // the same condition covers) spawns at half scale with body/helm/shield/
    // flying pools quartered. C++ int division truncates, hence floor — and
    // the maxes snapshot AFTER the division (Zombie.cpp:807-810). Paper and
    // ladder pools are NOT quartered in source. Challenge-mode
    // GAMEMODE_CHALLENGE_LITTLE_TROUBLE shares the predicate; adventure hits
    // only mLevel 25 (IsLittleTroubleLevel 2161-2164), which is the gate here.
    if (board.level === 25) {
      this.scaleZombie = 0.5;
      this.hp = Math.floor(this.hp / 4);
      this.helm = Math.floor(this.helm / 4);
      this.shield = Math.floor(this.shield / 4);
    }
    this.maxHp = this.hp;
    this.helmMax = this.helm; this.shieldMax = this.shield; this.paperMax = this.paper; this.ladderMax = this.ladder;
    // ZombiePhase subset that PickRandomSpeed branches on (Zombie.cpp:1096).
    this.phase = "normal";
    if (type === "ladder") this.phase = "carry";
    else if (type === "digger") this.phase = "tunnel";
    else if (type === "pole") this.phase = "prevault";
    else if (type === "news") this.phase = "reading"; // PHASE_NEWSPAPER_READING (542)
    else if (type === "snorkel") this.phase = "snorkel-walk"; // PHASE_SNORKEL_WALKING (422)
    else if (type === "dolphin") this.phase = "dolphin-walk"; // PHASE_DOLPHIN_WALKING (331)
    // Pool wading state (Zombie.cpp:113/126): mInPool flips when a
    // pool-capable walker crosses into/out of the pool squares (CheckForPool
    // 6847); mZombieHeight rides in_to_pool/out_of_pool/dragged/falling while
    // UpdateZombiePool (3241) animates mAltitude. `swimming` is NOT mInPool —
    // it is the pool-ROW flag (tube art via LoadPlainZombieReanim 950 +
    // pool-row spawn rules); a pool-row zombie starts on land (inPool false)
    // and splashes in at x<680 like retail.
    this.inPool = false; this.height = "normal";
    this.velX = 0; this.origRate = 12;
    // ZombieInitialize ZAMBONI (Zombie.cpp:522DD3): body 1350, drive anim,
    // spawn at WIDE_BOARD_WIDTH + Rand(10), velX starts 0 (UpdateZamboni
    // computes it), flat tires un-tripped.
    this.flatTires = false;
    this.dieT = 0; // PHASE_ZOMBIE_DYING counter (ZamboniDeath flat-tire path, 280)
    this.crashed = false; // BobsledCrash flag (Zombie.cpp:527F20 — sled gone, narrow rect)
    this.wheelie2 = false; // ZamboniDeath wheelie2 layer flag (Rand(4)==0 && x<600)
    this.groanCd = 300 + Math.floor(Math.random() * 101); // mGroanCounter (Zombie.cpp:120)
    this.age = 0; this.chill = 0; this.butter = 0; this.iceTrap = 0; // mChilledCounter/mButteredCounter/mIceTrapCounter
    this.yucky = 0; // mYuckyFaceCounter: garlic grimace (AnimateChewSound/UpdateYuckyFace)
    this.eating = false; this.dead = false; this.fadeT = -1;
    this.mowed = false; this.mowDriver = null; // PHASE_ZOMBIE_MOWERED (MowDown)
    // Damage visuals (Zombie.cpp): arm pops below 2/3 body hp, head below 1/3
    // — while still alive (UpdateDamageStates 3795); the headless zombie keeps
    // shambling, bleeding out via the UpdatePlaying isDying tick (4555), until
    // hp hits 0 and the fall plays. Hits flash white for 25 ticks.
    this.hasArm = true; this.hasHead = true;
    this.droppedLoot = false; // mDroppedLoot: DropLoot fires at head-pop AND death
    this.justShot = 0; this.shieldShot = 0; this.lastFlags = 1;
    this.shieldRecoil = 0; // mShieldRecoilCounter (TakeShieldDamage 7555)
    this.vaultT = 0; this.vaultVel = 0; this.vaultDur = 0; this.vaultBonked = false;
    this.pogoBroken = false; // PogoBreak tall-nut state (UpdateZombiePogo 1416-1427)
    this.flying = !!r.flying; this.swimming = !!r.water && board.isWaterRow(row);
    // `swimming` is the pool-ROW tube flag (LoadPlainZombieReanim 950 — the
    // tube shows from spawn on pool rows); mInPool starts false and flips in
    // CheckForPool as the zombie crosses the pool squares (6847).
    this.flyingHp = type === "balloon" ? 20 : 0; // mFlyingHealth (Zombie.cpp:569)
    // ZombieInitialize 798 quarters the flying pool on Little Trouble too
    // (no balloon on the adventure roster, but Challenge shares the branch).
    if (board.level === 25) this.flyingHp = Math.floor(this.flyingHp / 4);
    this.vaulted = false; this.summonCd = 0; this.fuse = 0; this.stompCd = 600;
    // Dance troupe state (Zombie.cpp:130/144/158-161): mPhaseCounter rides
    // phaseT, the leader's 4 follower slots ride followers[], the backup's
    // link to its leader rides related (mRelatedZombieID), and the beat-mirror
    // flag is recomputed every syncBody.
    this.phaseT = 0; this.followers = [null, null, null, null]; this.related = null;
    this.danceMirror = false;
    this.surprise = null; // ripped-paper "?" attached reanim (AddAttachedReanim 8321)
    this.burnT = 0; // PHASE_ZOMBIE_BURNED ticks remaining (ApplyBurn 8689): frozen black, then DieWithLoot
    this.ally = false; this.digging = type === "digger";
    this.hasObject = type === "digger" || type === "pogo"; // Zombie::mHasObject (ZombieInitialize: digger pickaxe + pogo stick; pole/flag/garg/yeti also true in source but have no port consumers — left false)
    this.blowingAway = false; // Zombie::mBlowingAway (BlowAwayFliers sets it on PHASE_BALLOON_FLYING zombies)
    this.digCd = type === "digger" ? 500 : 0;
   this.bungeeState = null; this.bungeeCell = null; this.targetPlant = null; this.hitUmbrella = false;
    this.screamed = false; this.grassStepped = false; // dive foley once-flags (BungeeLanding 1222-1229)
    this.cargo = null; this.carrier = null; // BungeeDropZombie rig links (Board.cpp:4906)
    if (type === "bungee") {
      // ZombieInitialize BUNGEE (Zombie.cpp:522A10): 450 body hp (ROSTER),
      // altitude BUNGEE_ZOMBIE_HEIGHT + Rand(0,150), no walk speed. On-board
      // bungees pick a target cell immediately (DieNoLoot on an empty lawn);
      // off-board street previews never construct here (cutscene.js builds
      // bare display reanims), so there is no CUTSCENE branch.
      this.altitude = 3000 + Math.floor(Math.random() * 151);
      this.velX = 0;
      this.pickBungeeZombieTarget();
      if (!this.bungeeCell) this.dieNoLoot(); // PickBungeeZombieTarget 1064-1068
      else this.bungeeState = "diving"; // PHASE_BUNGEE_DIVING
    }
    this.body = board.makeReanim(r.reanim, this.x, this.y);
    // ZombieInitialize (792-801): mScaleZombie is set BEFORE UpdateAnimSpeed,
    // so the walk rate already carries the /0.5 doubling when the walk anim
    // starts. The body scale must be in place before any playZombie/
    // pickRandomSpeed call — otherwise updateAnimSpeed divides by 1 (normal
    // rate) while groundStep multiplies by 0.5, leaving little zombies at
    // half speed. syncBody re-asserts this every tick; this covers ctor.
    if (this.scaleZombie !== 1) this.body.setScale(this.scaleZombie, this.scaleZombie);
    this.hideAccessories();
    // Zombie::ZombieInitialize water tracks (dolphin 338-339, snorkel
    // 419-420): the foam/submerged cels ignore the waterline clip (and the
    // color overrides) from spawn.
    if (type === "dolphin") {
      this.body.setupWaterTrack("zombie_dolphinrider_whitewater");
      this.body.setupWaterTrack("zombie_dolphinrider_dolphininwater");
    } else if (type === "snorkel") {
      this.body.setupWaterTrack("Zombie_snorkle_whitewater");
      this.body.setupWaterTrack("Zombie_snorkle_whitewater2");
    }
    if (type === "boss" && this.body.trackExists("anim_enter")) {
      // ZombieInitialize: enter once on board, then BossPlayIdle
      this.playZombie("anim_enter", PLAY_ONCE_AND_HOLD, 0, 12);
      this.enterDone = false;
    } else if (type === "dolphin") {
      // ZombieInitialize dolphin branch (Zombie.cpp:333-336): land walk with
      // the dolphin plays anim_walkdolphin (rate via UpdateAnimSpeed).
      if (this.body.trackExists("anim_walkdolphin")) this.playZombie("anim_walkdolphin", LOOP, 0, 0);
      else this.startWalkAnim(0);
      this.pickRandomSpeed();
    } else if (type === "pole") {
      this.playZombie("anim_run", LOOP, 0, 0); // rate via UpdateAnimSpeed
      this.pickRandomSpeed();
    } else if (type === "zamboni") {
      // ZombieInitialize ZAMBONI (Zombie.cpp:522DD3): WIDE_BOARD_WIDTH +
      // Rand(10), anim_drive @12, velX 0 (no PickRandomSpeed — UpdateZamboni
      // computes velX), variant false.
      this.x = BOARD_W + Math.floor(Math.random() * 10);
      this.y = zombieRowY(board.bg, this.x, row, type);
      this.playZombie("anim_drive", LOOP, 0, 12);
      this.variant = false;
    } else if (type === "bobsled") {
      // ZombieInitialize BOBSLED leader half (Zombie.cpp:523071): on-board
      // leaders spawn at WIDE_BOARD_WIDTH + 80 with the 300-hp sled pool,
      // the wide rect, 0.6 push speed, SLIDING + 500, anim_push @30. (The
      // follower half runs in spawnZombie, where the parent link exists;
      // save-load restores pools/phase/altitude from the snapshot.)
      this.x = BOARD_W + 80;
      this.y = zombieRowY(board.bg, this.x, row, type);
      this.altitude = -10;
      this.velX = 0.6;
      this.phase = "sliding"; this.phaseT = 500;
      this.variant = false;
      this.playZombie("anim_push", LOOP, 0, 30);
    } else if (type === "catapult") {
      this.playZombie("anim_walk", LOOP, 0, 5.5); // explicit slow shamble
      this.pickRandomSpeed();
    } else if (type === "balloon") {
      // ZombieInitialize balloon branch (Zombie.cpp): on-board balloons fly at
      // altitude 25 (PHASE_BALLOON_FLYING, anim_idle LOOP at the UpdateAnimSpeed
      // rate), variant false, 20-HP propeller pool (set with flyingHp above),
      // the (36,30,42,115) body + (20,30,50,115) attack rects (already in
      // zombieRect/attackRect), plus a propeller reanim on the "hat" track
      // playing Propeller LOOP_FULL_LAST_FRAME. (All Zombie objects are
      // on-board — previews build reanims directly — so this is the IsOnBoard
      // path; off-board previews take RandRange(8,10) instead, N/A here.)
      this.phase = "flying";
      this.altitude = 25;
      this.variant = false;
      this.playZombie("anim_idle", LOOP, 0, 0);
      this.pickRandomSpeed();
      try {
        this.propeller = board.makeReanim(r.reanim, this.x, this.y);
        if (this.propeller.trackExists("Propeller")) this.propeller.playReanim("Propeller", LOOP_FULL_LAST_FRAME, 0, 12);
        else this.propeller = null;
        if (this.propeller) this.propeller.attachTo(this.body, "hat");
      } catch (e) { this.propeller = null; }
    } else if (type === "digger") {
      // ZombieInitialize DIGGER (Zombie.cpp:522BCC): on-board diggers tunnel
      // (off-board CUTSCENE skipped — previews never dig). Fast 0.66-0.68
      // speed via PickRandomSpeed, dig anim, attached tunnel particle +
      // digging song.
      this.phase = "tunnel"; this.digging = true; this.hasObject = true;
      this.playZombie("anim_dig", LOOP_FULL_LAST_FRAME, 0, 12);
      this.pickRandomSpeed();
      try { this.board.spawnDiggerTunnel(this); } catch (e) { /* headless/def missing */ }
      this.startDiggerSong();
    } else if (type === "dancer") {
      // ZombieInitialize dancer branch (Zombie.cpp:576-590): on-board dancers
      // moonwalk in (DANCING_IN, velX 0.5, counter 300+Rand(12), moonwalk@24).
      // (All Zombie objects are on-board; previews build reanims directly.
      // Body hp 500 comes from ROSTER, matching mBodyHealth = 500 at 588.)
      this.phase = "dancein"; this.velX = 0.5;
      this.phaseT = 300 + Math.floor(Math.random() * 12);
      this.playZombie("anim_moonwalk", LOOP, 0, 24);
    } else if (type === "backup") {
      // ZombieInitialize backup branch (592-599): DANCING_LEFT on board
      // (body hp 270 from ROSTER, matching the default-270 at 167).
      this.phase = "danceleft";
      this.startWalkAnim(0);
    } else if (type === "jack") {
      // ZombieInitialize JACK_IN_THE_BOX (Zombie.cpp:425-447): on-board jacks
      // run (PHASE_JACK_IN_THE_BOX_RUNNING) with a WALK-DISTANCE fuse —
      // (450 + Rand(300), /3 on a 1/20 roll) / velX, x LIMB_FACTOR 2 — not a
      // timer, so chilled jacks pop at the same spot. The crank loop starts
      // here (FOLEY_JACKINTHEBOX, TodFoley.cpp:24 flags 7U — StartZombieSound
      // 7406, only while headed). (ScaryPotter's fuse-10 shortcut is out of
      // scope — no scary-potter levels in this port.)
      this.phase = "running";
      this.startWalkAnim(0); // re-picks 0.66-0.68 like PickRandomSpeed (1134)
      let dist = 450 + Math.floor(Math.random() * 300);
      if (Math.floor(Math.random() * 20) === 0) dist = Math.floor(dist / 3);
      this.fuse = Math.floor(dist / this.velX) * 2;
      this.startJackSong();
    } else if (type === "bungee") {
      // ZombieInitialize BUNGEE anim (Zombie.cpp:522A10): anim_drop LOOP @24
      // with the four arm tracks on RENDER_GROUP_ARMS (drawn after the
      // carried zombie/plant in DrawBungeeReanim). SetTruncateDisappearingFrames
      // has no port reanim equivalent — noted. Render layer GRAVE_STONE +7 has
      // no port equivalent either (fixed draw bands) — noted.
      if (!this.dead) {
        this.playZombie("anim_drop", LOOP, 0, 24);
        for (const tr of ["Zombie_bungi_rightarm_lower2", "Zombie_bungi_rightarm_hand2", "Zombie_bungi_leftarm_lower2", "Zombie_bungi_leftarm_hand2"])
          this.body.assignRenderGroupToPrefix(tr, RENDER_GROUP_ARMS);
      }
      this.variant = false;
    } else this.startWalkAnim(0);
    if (type === "flag") {
      // Zombie::ZombieInitialize (Zombie.cpp:512-524): the carried pole is
      // its own REANIM_FLAG reanim — pole + waving flag ONLY (retail has no
      // hand track in this def) — attached to the body's Zombie_flaghand
      // track, playing the "Zombie_flag" layer @15fps.
      try {
        this.flagPole = board.makeReanim("Zombie_FlagPole", this.x, this.y);
        this.flagPole.playReanim("Zombie_flag", LOOP, 0, 15);
        this.flagPole.attachTo(this.body, "Zombie_flaghand");
        this.body.frameBasePose = 0; // ZombieInitialize (Zombie.cpp:521)
      } catch (e) { this.flagPole = null; }
    }
    if (type === "catapult") { this.lobCd = 200; this.lobTimer = 200; }
  }
  hideAccessories() {
    concealZombieExtras(this.body, this.type, this.board.isWaterRow(this.row));
    // ZombieInitialize: variant zombies show the tongue (anim_tongue).
    if (this.variant && this.body.trackExists("anim_tongue"))
      this.body.assignRenderGroupToPrefix("anim_tongue", RENDER_GROUP_NORMAL);
  }
  // Zombie::GetHelmDamageIndex (5705) / GetShieldDamageIndex (5754): 0
  // intact, 1 below 2/3, 2 below 1/3 (integer division). The newspaper and
  // the ladder ride their own pools (SHIELDTYPE_NEWSPAPER/LADDER).
  armorStage() {
    const spec = ARMOR_STAGES[this.type];
    if (!spec) return 0;
    const cur = this[spec.pool], max = this[spec.pool + "Max"];
    if (!(max > 0) || cur <= 0) return -1;
    if (cur < Math.floor(max / 3)) return 2;
    if (cur < Math.floor((max * 2) / 3)) return 1;
    return 0;
  }
  // Re-apply the armor track cel for the current pool level (TakeHelmDamage
  // 7687 / TakeShieldDamage 7574: SetImageOverride on stage change).
  applyArmorStage() {
    const spec = ARMOR_STAGES[this.type];
    if (!spec) return;
    const idx = this.armorStage();
    if (idx <= 0) this.body.clearImageOverride(spec.track);
    else this.body.setImageOverrideByKey(spec.track, spec.stages[idx - 1]);
  }
  // Zombie::DropHelm (7614): hide the helm track, show the hair underneath
  // (cone/bucket/football; the digger hardhat just hides). When the armor is
  // destroyed by a body-leaving hit (flags without DOESNT_LEAVE_BODY), the
  // helm itself tumbles off as a particle (TRAFFIC_CONE/PAIL/HELMET/HEADLIGHT
  // at the helm track position, 7656-7660) — captured here as a posed
  // composite of the worn track BEFORE the override is cleared, so the
  // badly-cracked stage-3 art rides along. The bobsled crash (7651) and the
  // magnet steal (magnetAttract passes DOESNT_LEAVE_BODY — the helm flies to
  // the shroom, not onto the lawn) spawn nothing. Defaults to lastFlags so
  // damage-path callers can omit the argument; mowDown passes 0U explicitly.
  dropHelm(flags = this.lastFlags) {
    const spec = ARMOR_STAGES[this.type];
    // Capture the worn helm (with its stage-3 cracked override still on)
    // before hiding — the debris is the zombie's own helmet.
    let shot = null, kind = null;
    if (this.type === "cone") kind = "cone";
    else if (this.type === "bucket") kind = "pail";
    else if (this.type === "football") kind = "helmet";
    else if (this.type === "digger") kind = "headlight";
    if (kind && spec && !(flags & DMG_NOLEAVE)) {
      try { shot = this.body.poseComposite([spec.track]); } catch (e) { shot = null; }
    }
    if (spec && spec.pool === "helm") this.body.clearImageOverride(spec.track);
    const hide = (p) => this.body.assignRenderGroupToPrefix(p, RENDER_GROUP_HIDDEN);
    const show = (p) => this.body.assignRenderGroupToPrefix(p, RENDER_GROUP_NORMAL);
    if (this.type === "cone") { hide("anim_cone"); show("anim_hair"); }
    else if (this.type === "bucket") { hide("anim_bucket"); show("anim_hair"); }
    else if (this.type === "football") { hide("zombie_football_helmet"); show("anim_hair"); }
    else if (this.type === "digger") hide("Zombie_digger_hardhat");
    // Helm debris is NEVER chilled-blue (user override) — only head/arm body
    // debris carries the tint — so no tint call here.
    if (kind && shot) this.board.debris.push(new Debris(this.board, kind, shot.x, shot.y, this.row, shot));
  }
  // Zombie::DetachShield (8810) + DropShield (7482): the shield track (door /
  // newspaper / ladder) only draws while the shield pool is alive, so hiding
  // it is the equivalent. When destroyed by a body-leaving hit, the shield
  // itself falls off as a particle (DOOR at the screendoor track, NEWSPAPER
  // at the paper track, LADDER at mPosX+31/mPosY+80, 7492-7537) — captured as
  // a posed composite of the worn track BEFORE hiding, so the stage-3 art
  // rides along. Newspaper rips -> StopEating + MADDENING gasp @8, then MAD
  // at 0.89-0.91 with MADHEAD + rarrgh when the gasp completes
  // (UpdateZombieNewspaper 1632), RIP + "?" surprise on body-leaving
  // shield-pool hits (7522); ladder shatters -> back to a normal zombie
  // (walk/eat anims restart).
  // Defaults to lastFlags; mowDown passes 0U, the magnet steal
  // (magnetAttract) passes DOESNT_LEAVE_BODY so nothing falls.
  dropShield(flags = this.lastFlags) {
    const spec = ARMOR_STAGES[this.type];
    let shot = null, kind = null;
    if (this.type === "door") kind = "door";
    else if (this.type === "news") kind = "newspaper";
    else if (this.type === "ladder") kind = "ladder";
    if (kind && spec && spec.pool !== "helm" && !(flags & DMG_NOLEAVE)) {
      try { shot = this.body.poseComposite([spec.track]); } catch (e) { shot = null; }
    }
    if (spec && spec.pool !== "helm") this.body.clearImageOverride(spec.track);
    const hide = (p) => this.body.assignRenderGroupToPrefix(p, RENDER_GROUP_HIDDEN);
    const show = (p) => this.body.assignRenderGroupToPrefix(p, RENDER_GROUP_NORMAL);
    if (this.type === "door") {
      // DetachShield (8815): ShowDoorArms(false) — plain arms back on, door
      // arms off. Silent in source (no foley on the door break — only
      // newspaper rips). The door track itself also hides here: retail drops
      // it via the SHIELD render-group gate (mShieldType=NONE at 8849), which
      // this port doesn't model, so the explicit hide is the equivalent.
      hide("anim_screendoor");
      this.showDoorArms(false);
    } else if (this.type === "news") {
      hide("Zombie_paper_paper");
      // DropShield NEWSPAPER (Zombie.cpp:7500-7540), exactly: StopEating,
      // yucky-face clear, PHASE_NEWSPAPER_MADDENING + anim_gasp @8
      // PLAY_ONCE_AND_HOLD (the walk restart waits for the gasp loop in
      // updateNewspaper below — the zombie stands still meanwhile,
      // ZombieNotWalking 3845). DetachShield shows the hands (already NORMAL
      // here — no group concept in this port). The paper rips off as debris
      // at the paper track unless DOESNT_LEAVE_BODY; RIP + the "?" surprise
      // reanim fire only when the hit both leaves a body AND hits the shield
      // pool (!DOESNT_LEAVE_BODY && !BYPASSES_SHIELD, 7522).
      this.stopEating();
      this.yucky = 0; // ShowYuckyFace(false) + counter clear (7503-7508)
      this.phase = "maddening";
      if (this.body.trackExists("anim_gasp")) this.playZombie("anim_gasp", PLAY_ONCE_AND_HOLD, 10, 8);
      else this.updateNewspaper(true);
      const leavesBody = !(flags & DMG_NOLEAVE);
      if (leavesBody && !(flags & DMG_BYPASS)) {
        this.board.sfx("newspaperRip");
        this.attachSurprise();
      }
    } else if (this.type === "ladder") {
      hide("Zombie_ladder_1");
      if (this.hasArm) show("Zombie_outerarm"); // DetachShield (DO_FIX_BUGS guard)
      this.phase = "normal";
      if (this.eating) this.playZombie("anim_eat", LOOP, 20, 0);
      else this.startWalkAnim(0);
    }
    // Shield debris (door/newspaper/ladder) is NEVER chilled-blue (user
    // override) — only head/arm body debris carries the tint.
    if (kind && shot) this.board.debris.push(new Debris(this.board, kind, shot.x, shot.y, this.row, shot));
  }
  // Zombie::UpdateZombieNewspaper (1632): when the gasp completes
  // (loopCount > 0) the zombie goes NEWSPAPER_MAD — rarrgh (only when 10 or
  // fewer headed live zombies are on screen and it still has its head),
  // walk restart (StartWalkAnim(20) re-picks 0.89-0.91), and the head cel
  // swaps to the open-mouthed MADHEAD. Called every tick while maddening and
  // as a fallback straight from dropShield when the def has no gasp layer.
  updateNewspaper(fromDrop = false) {
    if (this.type !== "news" || this.phase !== "maddening" || this.dead) return;
    if (!fromDrop && this.body.loopCount <= 0) return;
    this.phase = "mad";
    if (this.hasHead && this.board.countZombiesOnScreen() <= 10) this.board.sfx(this.board.rarrghPick());
    if (this.body.trackExists("anim_head1")) this.body.setImageOverrideByKey("anim_head1", "IMAGE_REANIM_ZOMBIE_PAPER_MADHEAD");
    this.startWalkAnim(20);
  }
  // Zombie::AddAttachedReanim(-11, 0, REANIM_ZOMBIE_SURPRISE) (8321): the "?"
  // pops above the zombie when the paper rips (the digger's without-axe rise
  // uses it too — out of scope). PLAY_ONCE @12 (the ctor default), so it
  // plays its 15 frames and dies on its own; PlayDeathAnim kills it early
  // (8926, mirrored in die()). ART NOTE: main.zip's Zombie_questionmark.png
  // is a broken all-transparent export (0/1008 px opaque), so the 24x42 atlas
  // cel is a drawn stand-in (white "?" + black rim + detached dot, tuned to
  // the retail row metrics) — repo bytes stay out of src/ per the no-retail rule.
  attachSurprise() {
    try {
      const s = this.board.makeReanim("Zombie_surprise", this.x - 11, this.y);
      s.playReanim("Layer 1", PLAY_ONCE, 0, 12);
      this.surprise = s;
    } catch (e) { this.surprise = null; }
  }
  // Jack-in-the-box crank (StartZombieSound 7406 / StopZombieSound 7445-7457):
  // FOLEY_JACKINTHEBOX loops (TodFoley.cpp:24 pitch 0, flags 7U) while a
  // headed jack runs. The loop lives in the audio loop map (same pair as the
  // digger song); every stop site below mirrors a source StopZombieSound
  // call, every start a StartZombieSound call. Headless-safe: the sim never
  // touches audio directly.
  startJackSong() {
    try { this.board.libs.startLoop("jackinthebox"); } catch (e) { /* headless */ }
  }
  stopJackSong() {
    try { this.board.libs.stopLoop("jackinthebox"); } catch (e) { /* headless */ }
  }
  // Digger song (StartZombieSound 7410 / StopZombieSound 7445-7457):
  // FOLEY_DIGGER loops while a digger tunnels. One-shot in this port via the
  // same loop map as the jack crank; headless-safe.
  startDiggerSong() {
    try { this.board.libs.startLoop("digger"); } catch (e) { /* headless */ }
  }
  stopDiggerSong() {
    try { this.board.libs.stopLoop("digger"); } catch (e) { /* headless */ }
  }
  // Zombie::DiggerLoseAxe (Zombie.cpp:92161): steal the pickaxe. Tunneling
  // diggers pause (PAUSE_WITHOUT_AXE, counter 200, rate 0, tunnel particle
  // detached, song stopped); every steal clears hasObject + hides pickaxe
  // and dirt tracks.
  // Zombie::PogoBreak (Zombie.cpp:525350): the stick shatters. Height
  // FALLING (the port's altitude machine grounds it in 1 tick, then normal —
  // same shape as the tall-nut path), phase normal, walk restart, source
  // rects (36,17,42,115)/(20,17,50,115) which ride hasObject in
  // zombieRect/attackRect below, shield cleared, hasObject false. No
  // stick-track hide exists in source — the walk anim carries no stick frames
  // (frame -1), so the stick vanishes with the anim switch. The shatter
  // particle (PARTICLE_ZOMBIE_POGO at the stick track +30y) has no port
  // infrastructure, so it is skipped on every path (flags still thread
  // through for the day it exists) — noted.
  pogoBreak(flags = this.lastFlags) {
    if (!this.hasObject) return; // mHasObject (already stickless)
    this.height = "falling"; // HEIGHT_FALLING (UpdateZombieFalling grounds it)
    this.phase = "normal"; // PHASE_ZOMBIE_NORMAL
    this.startWalkAnim(0);
    this.shield = 0; // mShieldHealth + mShieldType NONE (pogo carries no shield pool)
    this.hasObject = false;
  }
  diggerLoseAxe() {
    if (this.phase === "tunnel") {
      this.phase = "digpause";
      this.phaseT = 200;
      this.origRate = 0; this.body.animRate = 0; // SetAnimRate(0)
      this.updateAnimSpeed();
      this.board.detachDiggerTunnel(this);
      this.stopDiggerSong();
    }
    this.hasObject = false;
    if (this.body.trackExists("Zombie_digger_pickaxe")) this.body.assignRenderGroupToPrefix("Zombie_digger_pickaxe", RENDER_GROUP_HIDDEN);
    if (this.body.trackExists("Zombie_digger_dirt")) this.body.assignRenderGroupToPrefix("Zombie_digger_dirt", RENDER_GROUP_HIDDEN);
  }
  // Zombie::UpdateZombieDigger (Zombie.cpp:92734): the full underground
  // phase machine. TUNNELING crawls left at velX until x<10, then RISING
  // (altitude -120, counter 130, drill, dirt+rise sfx, tunnel detach, song
  // stop, rise burst + dirt reanim). RISING eases -120->20 (EASE_OUT, ctr
  // 130->40) then 20->0 (EASE_IN, 30->0); at 30 the landing layer holds;
  // at 0 STUNNED with dizzy. PAUSE (axe stolen mid-tunnel) freezes 200
  // ticks, shows the surprise at 150, then RISE_WITHOUT_AXE (same curves,
  // landing blend 20 at 30, no dirt reanim rate difference); at 0
  // WALKING_WITHOUT_AXE + StartWalkAnim. STUNNED waits for the dizzy loop
  // (>1) then WALKING + StartWalkAnim. phaseT ticks generically above, so
  // this reads post-decrement counters (source Update ordering).
  updateDigger() {
    const b = this.board;
    if (this.phase === "tunnel") {
      // PHASE_DIGGER_TUNNELING: fast underground advance (velX Group B, no
      // chill slowdown). digging flag mirrors the tunnel phase for legacy gates.
      this.digging = true;
      if (this.x < 10) {
        this.altitude = -120;
        this.phase = "digrise"; this.phaseT = 130;
        this.digging = false;
        this.playZombie("anim_drill", LOOP, 0, 20);
        b.sfx("dirtRise"); // FOLEY_DIRT_RISE (pitch 5)
        b.sfx("wakeup"); // FOLEY_WAKEUP (flat)
        b.detachDiggerTunnel(this);
        this.stopDiggerSong();
        b.spawnDiggerRise(this.x + 60, this.y + 118, this.row);
        b.spawnDiggerDirt(this.x + 13, this.y + 97, this.row);
      } else {
        this.x -= this.velX;
      }
      return;
    }
    if (this.phase === "digrise") {
      const c = this.phaseT | 0;
      if (c > 40) this.altitude = todAnimateCurve(130, 40, c, -120, 20, "easeOut");
      else this.altitude = todAnimateCurve(30, 0, c, 20, 0, "easeIn");
      if (c === 30) this.playZombie("anim_landing", PLAY_ONCE_AND_HOLD, 0, 12);
      if (c === 0) {
        this.altitude = 0;
        this.phase = "digstun";
        this.playZombie("anim_dizzy", LOOP, 10, 12);
      }
      return;
    }
    if (this.phase === "digpause") {
      if ((this.phaseT | 0) === 150) {
        try {
          const sur = b.makeReanim("Zombie_surprise", this.x - 11, this.y);
          sur.playReanim("Layer 1", PLAY_ONCE, 0, 12);
          this.surprise = sur;
        } catch (e) { this.surprise = null; }
      }
      if ((this.phaseT | 0) === 0) {
        this.altitude = -120;
        this.phase = "digrisenoaxe"; this.phaseT = 130;
        this.playZombie("anim_landing", PLAY_ONCE_AND_HOLD, 0, 0); // rate 0 frozen pose
        b.sfx("dirtRise");
        b.spawnDiggerRise(this.x + 60, this.y + 118, this.row);
        b.spawnDiggerDirt(this.x + 13, this.y + 97, this.row);
      }
      return;
    }
    if (this.phase === "digrisenoaxe") {
      const c = this.phaseT | 0;
      if (c > 40) this.altitude = todAnimateCurve(130, 40, c, -120, 20, "easeOut");
      else this.altitude = todAnimateCurve(30, 0, c, 20, 0, "easeIn");
      if (c === 30) this.playZombie("anim_landing", PLAY_ONCE_AND_HOLD, 20, 12);
      if (c === 0) {
        this.altitude = 0;
        this.phase = "digwalknoaxe";
        this.startWalkAnim(20);
      }
      return;
    }
    if (this.phase === "digstun") {
      if (this.body.loopCount > 1) {
        this.phase = "digwalk";
        this.startWalkAnim(20);
      }
      return;
    }
  }
  // Zombie::DieNoLoot (7368): award try, no loot, no fall — instant removal
  // for backwards walkers past x>850 (CheckForBoardEdge 4436).
  dieNoLoot() {
    if (this.dead) return;
    if (this.type === "bungee") this.bungeeDie(); // BungeeDie (Zombie.cpp:7373)
    this.stopDancerSound();
    this.stopJackSong(); this.stopDiggerSong(); this.board.detachDiggerTunnel(this);
    this.board.trySpawnLevelAward(this);
    this.dead = true; this.gone = true;
  }
  // UpdateZombieJackInTheBox (Zombie.cpp:1979-2026): RUNNING burns the
  // walk-distance fuse (the Update() immobilized gate above is the only
  // throttle — butter/ice-trap freeze the fuse, chill does not); at 0 a
  // headed jack pops: phaseT 110, crank stops, SOUND_BOING (raw PlaySample),
  // anim_pop PLAY_ONCE_AND_HOLD blend 20 @28. The generic phaseT tick (5185)
  // counts the pop down: at 80 the FOLEY_JACK_SURPRISE set-pick fires, at 0
  // the box blows. Headless jacks never pop (1983 mHasHead gate) — they
  // shamble on until the bleed-out fells them.
  updateJack() {
    const b = this.board;
    if (this.phase === "running") {
      if (!this.hasHead) return;
      if (--this.fuse <= 0) {
        this.phase = "popping"; this.phaseT = 110;
        this.stopJackSong(); // StopZombieSound (1988)
        b.sfx("boing"); // SOUND_BOING (1989-1990)
        this.playZombie("anim_pop", PLAY_ONCE_AND_HOLD, 20, 28);
      }
    } else if (this.phase === "popping") {
      if (this.phaseT === 80) b.sfx(b.jackSurprisePick()); // FOLEY_JACK_SURPRISE (1997)
      if (this.phaseT <= 0) this.explodeJack();
    }
  }
  // The pop completes (2000-2018): FOLEY_EXPLOSION, circle-115 burn vs
  // zombies row+-1 (KillAllZombiesInRadius burn=true: the mind-controlled
  // blast takes enemy zombies with flags 127, a normal blast takes the
  // traitor allies with 255 — EffectedByDamage does the split), circle-90
  // plant kill (KillAllPlantsInRadius — normal jacks only; the hypno blast
  // spares plants), PARTICLE_JACKEXPLODE at the blast center
  // (mX+mWidth/2, mY+mHeight/2 = +60/+60 on the 120x120 body),
  // ShakeBoard(4,-6), DieNoLoot (the carrier vanishes inside the cloud — no
  // corpse, no loot, but the level-award try still runs).
  explodeJack() {
    const b = this.board;
    const cx = this.x + 60, cy = this.y + 60;
    b.sfx("boom"); // FOLEY_EXPLOSION (2002, flat)
    b.killAllZombiesInRadius(this.row, cx, cy, 115, 1, true, this.ally ? 127 : 255);
    if (!this.ally) b.killAllPlantsInRadius(cx, cy, 90);
    // Vasebreaker (Challenge::ScaryPotterJackExplode 4281-4294): the blast
    // opens vases in 1-cell range. Skipped for mind-controlled (ally) jacks.
    if (!this.ally) b.vaseJackExplode(cx, cy);
    b.spawnJackExplode(cx, cy); // PARTICLE_JACKEXPLODE, RENDER_LAYER_TOP (2016)
    b.shake = 4; // ShakeBoard(4,-6) (2017)
    this.jackDieNoLoot(); // DieNoLoot (2018)
  }
  // Zombie::DieNoLoot (7359) for the jack blast: StopZombieSound (7361),
  // award try + almanac defeat mark (7368/7211), dead + gone with no fall,
  // no debris, no loot. (Port bodies have no separate reanim registry to
  // purge — dead+gone drops them from the sim and every render pass.)
  jackDieNoLoot() {
    this.stopJackSong();
    try { this.board.noteZombieDefeated(this); } catch (e) { /* headless without board */ }
    this.board.trySpawnLevelAward(this);
    if (this.seaweeds) { for (const sw of this.seaweeds) { try { sw.reanim.detach(); } catch (e) { /* ignore */ } sw.reanim.dead = true; } this.seaweeds = null; }
    if (this.surprise) this.surprise.dead = true;
    if (this.tangleFx) { this.tangleFx.dead = true; this.tangleFx = null; }
    this.stopEating();
    this.dead = true; this.gone = true;
  }
  // Zombie::RiseFromGrave pool (Zombie.cpp:8167-8196): one
  // PARTICLE_ZOMBIE_SEAWEED system per track (head/cone/bucket + outerarm +
  // tube). Retail rollout: SeaweedHead emitter (IMAGE_ZOMBIE_SEAWEED, 4x58x58
  // main.zip particles art, byte-identical in our atlas), SpawnMinActive/
  // MaxLaunched 1 (a single mote), ParticleDuration 60, ParticleScale
  // 0.6..0.8 random, static random frame (Animated 0 + no AnimationRate holds
  // Rand(4)) and static random spin (RandomLaunchSpin, zero spin velocity).
  // The mote spawns at a random disk point: EmitterRadius 0..5 (EMITTER_CIRCLE
  // default, LaunchAngle unset -> random angle, y-down sin/cos). The systems
  // NEVER age out on their own — flags 25 = RANDOM_LAUNCH_SPIN | SYSTEM_LOOPS
  // | PARTICLE_LOOPS, so the mote re-loops every 60 ticks and the system
  // re-loops instead of dying (TodParticle.cpp:623/786); they live until
  // AttachmentDie on zombie death (mirrored in die() + the mid-rise kill).
  // OverrideScale = mScaleZombie multiplies the random scale (TodParticle
  // 904: mParticleScale = particle * mScaleOverride). No OverrideColor call
  // in RiseFromGrave, so seaweed keeps identity colors under chill/mind/burn
  // (the tint paths repaint it straight for exactly this reason).
  // Port: one frozen-frame Seaweed reanim per system, attached via attachTo
  // (track-following overlay + waterline clip inline) with the retail offsets
  // + radius scatter, random frame/scale/spin, rate forced 0 (static even if
  // anything ever ticks it), noCoat (attached systems render outside
  // DrawReanim's color/flash overrides).
  attachSeaweed(track, ox, oy) {
    try {
      if (!this.body.trackExists(track)) return;
      const s = this.board.makeReanim("Seaweed", this.x, this.y);
      s.playReanim("seaweed", PLAY_ONCE_AND_HOLD, 0, 0);
      s.animRate = 0; // static frame even if ticked (retail: no AnimationRate)
      s.animTime = Math.floor(Math.random() * 4) / 3; // frozen Rand(ImageFrames)
      s.noCoat = true;
      // EmitterRadius scatter (TodParticle.cpp:372-377): uniform r in [0,5],
      // random angle, angle-0-is-down like the rest of the engine.
      const rr = Math.random() * 5, ra = Math.random() * Math.PI * 2;
      s.attachTo(this.body, track, ox + Math.sin(ra) * rr, oy + Math.cos(ra) * rr,
        (0.6 + Math.random() * 0.2) * (this.scaleZombie || 1), // scale + OverrideScale
        true, // hide with a hidden parent track (AttachmentDraw !aTrackDrawn)
        Math.random() * Math.PI * 2); // RandomLaunchSpin
      (this.seaweeds = this.seaweeds || []).push({ reanim: s });
    } catch (e) { /* def missing */ }
  }
  // (Magnet steals now run through Plant::magnetAttract — per-type disarm +
  // flying item — so there is no shared stripMetal helper.)
  // Zombie::PlayZombieReanim: nonzero rates stick as the base walk rate.
  playZombie(layer, loopType, blend, rate) {
    if (!this.body.trackExists(layer)) layer = "anim_idle";
    this.body.playReanim(layer, loopType, blend, rate);
    if (rate !== 0) this.origRate = rate;
    this.updateAnimSpeed();
  }
  // Zombie::PickRandomSpeed (Zombie.cpp:1096): per-individual px/tick.
  // Retail has NO mind-control branch — the convert sites set mVelX = 0.17
  // directly (AnimateChewSound 4742); every later StartWalkAnim re-pick rolls
  // the phase table like anyone else (mad allies 0.89-0.91, post-vault poles
  // the default range). The old `ally -> 0.17` branch froze every ally at
  // convert speed forever.
  pickRandomSpeed() {
    const t = this.type, ph = this.phase;
    const range = (a, b) => a + Math.random() * (b - a);
    if (ph === "poolwalk") this.velX = 0.3; // PHASE_SNORKEL_WALKING_IN_POOL
    else if (ph === "digwalk") this.velX = 0.12; // PHASE_DIGGER_WALKING (digwalknoaxe falls through to default 0.23-0.37)
    else if (t === "dancer" || t === "backup" || t === "pogo" || t === "flag") this.velX = 0.45;
    else if (ph === "tunnel" || ph === "prevault" || t === "football" || t === "snorkel" || t === "jack") this.velX = range(0.66, 0.68);
    else if (ph === "carry") this.velX = range(0.79, 0.81); // PHASE_LADDER_CARRYING
    // PHASE_DOLPHIN_WALKING_IN_POOL / RIDING / INTO_POOL / IN_JUMP fall
    // through to the default 0.23-0.37 range like retail (PickRandomSpeed
    // 1096: only WALKING and WALKING_WITHOUT_DOLPHIN get 0.89-0.91). They
    // must NOT inherit ROSTER.dolphin (0.89-0.91) via the default branch.
    else if (t === "dolphin" && (ph === "dolphin-poolwalk" || ph === "ride" || ph === "dolphin-into-pool" || ph === "dolphin-jump")) this.velX = range(0.23, 0.37);
    // PHASE_NEWSPAPER_MAD / PHASE_DOLPHIN_WALKING /
    // PHASE_DOLPHIN_WALKING_WITHOUT_DOLPHIN (PickRandomSpeed 1140): land
    // dolphin (with or without the ride) walks 0.89-0.91.
    else if (ph === "mad" || ph === "dolphin-walk" || ph === "dolphin-walk-nodolphin") this.velX = range(0.89, 0.91);
    // Bobsleds that lost the sled walk the default range (PickRandomSpeed
    // has no sled branch — the 0.6 push speed only lives while linked).
    else if (t === "bobsled" && this.bobsledPosition() === -1) this.velX = range(0.23, 0.37);
    else if (t === "pole") this.velX = range(0.23, 0.37); // POST_VAULT default
    else {
      const s = ROSTER[t].speed;
      this.velX = Array.isArray(s) ? range(s[0], s[1]) : s;
    }
    this.updateAnimSpeed();
  }
  // _ground distance covered by the currently playing layer (for the
  // UpdateAnimSpeed rate formula). Null when the reanim has no usable
  // _ground track (zamboni drive, catapult walk) — source keeps the old rate.
  groundSpan() {
    const b = this.body;
    if (!b.trackExists("_ground") || b.frameCount <= 0) return null;
    const fr = b.def.tracks[b.findTrackIndex("_ground")].frames;
    if (b.frameStart + b.frameCount > fr.length) return null;
    const d = fr[b.frameStart + b.frameCount - 1].x - fr[b.frameStart].x;
    return d >= 1e-6 ? { n: b.frameCount, d } : null;
  }
  // Zombie::UpdateAnimSpeed (Zombie.cpp:6563): the walk-cycle rate follows
  // the zombie's own velocity; eating/chill/butter override it.
  updateAnimSpeed() {
    const b = this.body;
    if (!b) return;
    const chilled = this.isChilledSpeed();
    const apply = (r) => { b.animRate = chilled ? r * CHILL_FACTOR : r; };
    if (this.burnT > 0) { b.animRate = 0; return; } // SetAnimRate(0): burned zombies stand frozen (ApplyBurn 8682)
    if (this.butter > 0 || this.iceTrap > 0) { b.animRate = 0; return; } // IsImmobilizied
    // UpdateAnimSpeed (6572): the garlic grimace freezes the anim (rate 0)
    // until the counter hits 170 — the zombie keeps walking underneath.
    if (this.yucky > 0 && this.yucky < 170) { b.animRate = 0; return; }
    // UpdateAnimSpeed (6578): the transitional surface/dive phases hold the
    // original rate; the eating-in-pool phase does NOT (it eats at 20, below).
    if (this.dead || this.phase === "snorkel-up" || this.phase === "snorkel-down") { b.animRate = this.origRate; return; }
    if (this.eating) { apply(SMALL_EATERS.has(this.type) ? EAT_RATE_SMALL : EAT_RATE); return; }
    const t = this.type;
    // ZombieNotWalking / bobsled-team / catapult / dolphin-riding /
    // snorkel-in-pool keep the original rate (6599): rooted dancers hold
    // theirs (0 while rising, walk/armraise rates once up). Into-pool, jump,
    // down-from-eat and dolphin-poolwalk phases do NOT hold — they have no
    // _ground span, so they keep the old rate naturally until the next
    // ground-locked layer (retail holds only RIDING + SNORKEL poolwalk).
    // UpdateAnimSpeed (6599): the original-rate hold is team-with-sled, not
    // type-wide — crash-unlinked bobsleds walk ground-locked below like
    // normals (their _ground track drives the rate).
    if (this.zombieNotWalking() || (t === "bobsled" && this.bobsledPosition() !== -1) || t === "zamboni" || t === "catapult" ||
        this.phase === "ride" || this.phase === "poolwalk" ||
        this.phase === "maddening" || this.vaultT > 0) { apply(this.origRate); return; } // maddening: gasp @8 (StartWalkAnim restarts it at MAD)
    const g = this.groundSpan();
    if (g) apply(this.velX * (g.n / g.d) * WALK_GROUND_K / (b.scaleX || 1));
  }
  // Zombie::StartWalkAnim (Zombie.cpp:6670): re-picks speed, then the layer.
  // Source order is carry -> mad -> inPool swim (6685, any pool wader with
  // the track, which covers snorkel/dolphin poolwalk since both ride with
  // mInPool true) -> dance (no dance mode in this port) -> walk variants.
  startWalkAnim(blend) {
    this.pickRandomSpeed();
    const b = this.body;
    let layer = "anim_walk";
    if (this.phase === "carry" && b.trackExists("anim_ladderwalk")) layer = "anim_ladderwalk";
    else if (this.phase === "mad" && b.trackExists("anim_walk_nopaper")) layer = "anim_walk_nopaper";
    // StartWalkAnim (6685): pool waders swim when the def has the track — any
    // height except the in/out-of-pool transitions (tangle-dragged victims
    // swim too, like retail).
    else if (this.inPool && this.height !== "in_to_pool" && this.height !== "out_of_pool" && b.trackExists("anim_swim")) layer = "anim_swim";
    else if (this.type === "flag" && b.trackExists("anim_walk2")) layer = "anim_walk2"; // flag always variant 0
    else if (b.trackExists("anim_walk2") && Math.random() < 0.5) layer = "anim_walk2";
    this.playZombie(layer, LOOP, blend, 0);
  }
  // Zombie::ShowDoorArms (Zombie.cpp:892) + SetupDoorArms (830): swaps the
  // plain arms against the door arms. The !hasArm guard (898-902) keeps a
  // lost arm lost through the swap.
  showDoorArms(show) {
    const b = this.body;
    const armG = show ? RENDER_GROUP_HIDDEN : RENDER_GROUP_NORMAL;
    const doorG = show ? RENDER_GROUP_NORMAL : RENDER_GROUP_HIDDEN;
    b.assignRenderGroupToPrefix("Zombie_outerarm_hand", armG);
    b.assignRenderGroupToPrefix("Zombie_outerarm_lower", armG);
    b.assignRenderGroupToPrefix("Zombie_outerarm_upper", armG);
    b.assignRenderGroupToPrefix("anim_innerarm", armG);
    b.assignRenderGroupToPrefix("Zombie_outerarm_screendoor", doorG);
    b.assignRenderGroupToPrefix("Zombie_innerarm_screendoor", doorG);
    b.assignRenderGroupToPrefix("Zombie_innerarm_screendoor_hand", doorG);
    if (!this.hasArm) {
      b.assignRenderGroupToPrefix("Zombie_outerarm_lower", RENDER_GROUP_HIDDEN);
      b.assignRenderGroupToPrefix("Zombie_outerarm_hand", RENDER_GROUP_HIDDEN);
    }
  }
  // Zombie::StartEating / StopEating (Zombie.cpp:6637/6717).
  startEating() {
    if (this.eating) return;
    // Popping jacks keep the box-opening surprise: the eat machine must not
    // steal anim_pop mid-fuse (reported bug — the clown never appeared and
    // the crank just died into chewing). Bites still land via eatPlant; only
    // the anim switch is suppressed, and the 28fps pop rate survives since
    // the eating branch of updateAnimSpeed never engages.
    if (this.type === "jack" && this.phase === "popping") return;
    this.eating = true;
    if (this.type === "digger" && this.phase === "tunnel") return; // StartEating 6643: only TUNNELING skips the anim
    const b = this.body;
    if (this.phase === "carry" && b.trackExists("anim_laddereat")) this.playZombie("anim_laddereat", LOOP, 20, 0);
    else if (this.phase === "mad" && b.trackExists("anim_eat_nopaper")) this.playZombie("anim_eat_nopaper", LOOP, 20, 0);
    else if (this.type === "snorkel") { /* keeps anim_swim while eating (StartEating 6657) */ }
    else this.playZombie("anim_eat", LOOP, 20, 0);
    // StartEating (6662): ShowDoorArms(false) while chewing — gated on the
    // shield TYPE (mShieldType==DOOR), which DetachShield clears at break, so
    // the equivalent here is shield>0: a doorless zombie keeps its arms.
    if (this.type === "door" && this.shield > 0) this.showDoorArms(false);
  }
  stopEating() {
    if (!this.eating) return;
    this.eating = false;
    // Same popping guard, other direction: the walk restart below would
    // clobber anim_pop when the victim dies (or leaves range) mid-pop.
    // The flag still clears so the chew machine goes silent; only the
    // re-walk is skipped, and the pop rate is re-applied.
    if (this.type === "jack" && this.phase === "popping") { this.updateAnimSpeed(); return; }
    if (this.type === "digger" && this.phase === "tunnel") return; // StopEating 6723: TUNNELING skips the re-walk
    // StopEating (6728): every type except the snorkel re-walks here — the
    // snorkel's own machine drives the down-from-eat transition instead.
    if (this.type !== "snorkel") this.startWalkAnim(20);
    // StopEating (6733): ShowDoorArms(true), same shield>0 gate as above.
    if (this.type === "door" && this.shield > 0) this.showDoorArms(true);
    this.updateAnimSpeed(); // StopEating always re-rates (6738), door included
  }
  // Zombie::PoolSplash (Zombie.cpp:6823): the pool entry/exit burst — a
  // REANIM_SPLASH reanim at (+23,+78) plus a PARTICLE_PLANTING_POOL puff at
  // (+60,+120), with FOLEY_ZOMBIESPLASH coming IN and FOLEY_PLANT_WATER
  // going out. Snorkel offsets shift (-37,+8) in-pool. Board.poolSplash
  // owns the fx (reanim + water motes); the foley pick rides here.
  poolSplash(inToPoolSound) {
    const b = this.board;
    let ox = 23, oy = 78;
    if (this.phase === "poolwalk") { ox -= 37; oy -= -8; }
    b.poolSplash(this.x + ox, this.y + oy, 0.8, 0.8);
    b.sfx(inToPoolSound ? "zombiesplash" : "plantWater");
  }
  // Zombie::ZombieTypeCanGoInPool (8235) as a type check: normal, cone, pail,
  // flag, balloon, snorkel, dolphin (+ zombotany heads, out of scope).
  // DUCKY_TUBE is deliberately ABSENT (source excludes it): duckies spawn on
  // LAND rows (RowCanHaveZombieType rejects pool rows for them) and never
  // wade in — CheckForPool early-outs, no splash, no swim clip. The tube art
  // rides every ducky via concealZombieExtras instead (LoadPlain 885-888).
  static typeCanGoInPool(t) {
    return t === "normal" || t === "cone" || t === "bucket" || t === "flag" ||
      t === "balloon" || t === "snorkel" || t === "dolphin";
  }
  // Zombie::CheckForPool (Zombie.cpp:6847): land<->pool transitions for
  // pool-capable walkers (snorkel/dolphin run their own machines and flying
  // zombies never wade). Both sample points (mX+75, mX+45) must sit in pool
  // squares and mX < 680. Coming in with an ice trap queued chills instead
  // of splashing (6869-6873); going out re-walks + splashes (6881-6886).
  checkForPool() {
    if (!Zombie.typeCanGoInPool(this.type) || this.flying) return;
    if (this.type === "dolphin" || this.type === "snorkel") return;
    if (this.height === "in_to_pool" || this.height === "out_of_pool") return;
    const b = this.board;
    const px = (x) => b.pixelToGridCol(x);
    const inSq = b.isPoolSquare(px(this.x + 75), this.row) &&
      b.isPoolSquare(px(this.x + 45), this.row) && this.x < 680;
    if (!this.inPool && inSq) {
      if (b.iceTrapCounter > 0) {
        this.iceTrap = b.iceTrapCounter;
        // ApplyChill(true): the pool-entry chill (Zombie.cpp:6871).
        if (this.chill === 0) b.sfx("frozen");
        this.chill = Math.max(this.chill, 2000);
        this.updateAnimSpeed();
      } else {
        this.height = "in_to_pool";
        this.inPool = true;
        this.poolSplash(true);
      }
    } else if (this.inPool && !inSq) {
      this.height = "out_of_pool";
      this.startWalkAnim(0);
      this.poolSplash(false);
    }
  }
  // Zombie::UpdateZombiePool (Zombie.cpp:3241): the height animation.
  // OUT_OF_POOL climbs (+1/tick, +2 for snorkel) back to 0; IN_TO_POOL sinks
  // to -40*scale then walks; DRAGGED_UNDER (tangle) keeps sinking (the kill
  // lands from the plant side at countdown 0).
  updateZombiePool() {
    if (this.height === "out_of_pool") {
      this.altitude++;
      if (this.type === "snorkel") this.altitude++;
      if (this.altitude >= 0) {
        this.altitude = 0;
        this.height = "normal";
        this.inPool = false;
      }
    } else if (this.height === "in_to_pool") {
      this.altitude--;
      const depth = -40 * (this.scaleZombie || 1);
      if (this.altitude <= depth) {
        this.altitude = depth;
        this.height = "normal";
        // Zombie::UpdateZombiePool phase-counter-0 branch (3036-3042): the
        // wader is fully in — unclip tube/hands/foam (hand names are no-ops
        // in this def, see LoadPlainZombieReanim note above).
        if (this.inPool) {
          this.body.setIgnoreClipRect("Zombie_duckytube", true);
          this.body.setIgnoreClipRect("Zombie_whitewater", true);
          this.body.setIgnoreClipRect("Zombie_outerarm_hand", true);
          this.body.setIgnoreClipRect("Zombie_innerarm3", true);
        }
        this.startWalkAnim(0);
      }
    } else if (this.height === "dragged") {
      this.altitude--;
    } else if (this.height === "falling") {
      // UpdateZombieFalling (3303): altitude-- (+1 extra while pole
      // prevault), ground 0 (high ground unmodeled — always 0 here), snap
      // when <= ground.
      this.altitude--;
      if (this.phase === "prevault") this.altitude--;
      if (this.altitude <= 0) {
        this.altitude = 0;
        this.height = "normal";
      }
    }
  }
  // Zombie::DragUnder (Zombie.cpp:3046): the tangle kelp pull — height
  // DRAGGED_UNDER, stop eating, re-enable clipping.
  dragUnder() {
    this.height = "dragged";
    this.stopEating();
    this.body.reenableClipping();
  }
  // Zombie::IsTangleKelpTarget (Zombie.cpp:8389): already dragged, or grabbed
  // by a tangle kelp (plant target id match).
  isTangleKelpTarget() {
    if (this.height === "dragged") return true;
    const b = this.board;
    for (const p of b.allPlants()) {
      if (p.seed === 19 && p.state === "grabbing" && p.targetZombie === this) return true;
    }
    return false;
  }
  // Zombie::GetZombieRect (Zombie.cpp:8258): per-type mZombieRect offsets
  // (ZombieInitialize) + backwards mirror + draw-pos offset. bodyY/clipHeight
  // only matter for grave-rise/dive phases (unmodeled here), so they are 0.
  zombieRect() {
    const t = this.type;
    if (t === "boss") return { x: 700, y: 80, w: 90, h: 430 };
    let rx, ry, rw, rh;
    if (t === "football") { rx = 50; ry = 0; rw = 57; rh = 115; }
    else if (t === "digger") { rx = 50; ry = 0; rw = 28; rh = 115; }
    else if (t === "garg") { rx = -17; ry = -38; rw = 125; rh = 154; }
    else if (t === "zamboni" || t === "catapult") { rx = 0; ry = -13; rw = 153; rh = 140; }
    else if (t === "snorkel") { rx = 12; ry = 0; rw = 62; rh = 115; }
    else if (t === "bungee") { rx = -20; ry = 22; rw = 110; rh = 94; }
    else if (t === "balloon") { rx = 36; ry = 30; rw = 42; rh = 115; }
    else if (t === "bobsled" && !this.parent && !this.crashed) { rx = -50; ry = 0; rw = 275; rh = 115; }
    else if (t === "bobsled" && this.crashed) { rx = 36; ry = 0; rw = 42; rh = 115; } // post-crash (BobsledCrash 36,0,42,115)
    else if (t === "pogo" && !this.hasObject) { rx = 36; ry = 17; rw = 42; rh = 115; } // post-break (PogoBreak 36,17,42,115)
    else { rx = 36; ry = 0; rw = 42; rh = 115; }
    if (t === "dolphin" && (this.phase === "dolphin-poolwalk" || this.phase === "dolphin-walk-nodolphin")) { rx = 20; rw = 42; } // post-jump rect (Zombie.cpp:1859) persists — never reset
    // IsWalkingBackwards (Zombie.cpp:4980): allies walk backwards; emerged
    // diggers walk backwards (digwalk). mWidth 80 (180 for garg).
    const mw = t === "garg" ? 180 : 80;
    if (this.ally || this.isDiggerBackwards()) rx = mw - rx - rw;
    return { x: this.x + rx, y: this.y + ry, w: rw, h: rh };
  }
  // Zombie::GetDrawPos pool branches (Zombie.cpp:5909-6027): the body rides
  // -mAltitude with a waterline clip while wading, diving, jumping or
  // dragged. Returns {bodyY, clipHeight}; CLIP_HEIGHT_OFF (-1000+) means no
  // clip. The renderer turns this into the DrawReanim clip rect.
  getDrawPos() {
    const CLIP_OFF = -1000;
    const alt = this.altitude | 0;
    // Zombie::GetDrawPos rising branch (5909-5929): checked before every
    // type branch in source. Pool risers clip at bodyY, land risers at
    // bodyY + min(phaseCounter, 40). High ground unmodeled (always 0 here).
    // The renderer also applies this for phase "rising" directly; this
    // return keeps getDrawPos callers (clip rect + shadow paths) consistent.
    if (this.phase === "rising") {
      const rBodyY = -alt;
      const rClip = this.inPool ? rBodyY : rBodyY + Math.min(this.riseT | 0, 40);
      return { bodyY: rBodyY, clipHeight: rClip };
    }
    // Digger PHASE_DIGGER_RISING / RISE_WITHOUT_AXE (6038-6049):
    // bodyY=-altitude; clip=bodyY while phaseT>20, else CLIP_HEIGHT_OFF.
    if (this.type === "digger" && (this.phase === "digrise" || this.phase === "digrisenoaxe")) {
      const dBodyY = -alt;
      const dClip = (this.phaseT | 0) > 20 ? dBodyY : CLIP_OFF;
      return { bodyY: dBodyY, clipHeight: dClip };
    }
    if (this.type === "dolphin") {
      const t = this.body ? this.body.animTime : 0;
      if (this.phase === "dolphin-into-pool") {
        if (t >= 0.56 && t <= 0.65) return { bodyY: -alt, clipHeight: 0 };
        if (t >= 0.75) return { bodyY: -alt, clipHeight: -alt - 10 };
        return { bodyY: -alt, clipHeight: CLIP_OFF };
      }
      if (this.phase === "ride") {
        return { bodyY: -alt, clipHeight: this.height === "dragged" ? -alt - 15 : -alt - 10, rideDX: 70 };
      }
      if (this.phase === "dolphin-jump") {
        let clip = CLIP_OFF;
        if (t <= 0.06) clip = -alt - 10;
        else if (t >= 0.5 && t <= 0.76) clip = -13;
        return { bodyY: -alt, clipHeight: clip, rideDX: 70 + alt };
      }
      if (this.phase === "dolphin-poolwalk" || this.phase === "dying") {
        // GetDrawPos (5976): the in-pool body rides 50px lower via
        // mImageOffsetY — bodyY stays -alt, the +50 is a separate image
        // offset (consumed by syncBody + the renderer clip).
        if (this.phase === "dying") return { bodyY: -alt, clipHeight: -alt + 44, rideDX: 0, rideDY: 50 };
        return { bodyY: -alt, clipHeight: this.height === "dragged" ? -alt + 36 : CLIP_OFF, rideDX: 0, rideDY: 50 };
      }
      if ((this.phase === "dolphin-walk" || this.phase === "dolphin-walk-nodolphin") && this.height === "out_of_pool") {
        return { bodyY: -alt, clipHeight: -alt };
      }
      return { bodyY: -alt, clipHeight: CLIP_OFF };
    }
    if (this.type === "snorkel") {
      const t = this.body ? this.body.animTime : 0;
      if (this.phase === "snorkel-into-pool") {
        return { bodyY: -alt, clipHeight: t >= 0.8 ? -10 : CLIP_OFF };
      }
      if (this.inPool) {
        let clip = -alt - 5;
        clip += 20 - 20 * (this.scaleZombie || 1);
        return { bodyY: -alt, clipHeight: clip };
      }
      return { bodyY: -alt, clipHeight: CLIP_OFF };
    }
    if (this.inPool) {
      let clip = -alt - 7;
      clip += 10 - 10 * (this.scaleZombie || 1);
      if (this.eating) clip += 7;
      return { bodyY: -alt, clipHeight: clip };
    }
    // Zombie::GetDrawPos dancer branch (6028-6037): a rising backup rides
    // -mAltitude with the clip tracking the body exactly (no phaseCounter
    // easing like grave rise) — it emerges head-first instead of sliding
    // up whole. DrawReanim (5574-5578) applies the same clip rect as grave
    // rise, gated on clipHeight > -100 (fully underground = no clip).
    if (this.phase === "dancerise") return { bodyY: -alt, clipHeight: -alt };
    // Zombie::GetDrawPos bungee branch (6051-6062): body rides -altitude with
    // the -18 X nudge (in ZOMBIE_DRAW_OFFSETS + syncBody); clip always off.
    // High ground unmodeled. Dolphin ride offsets stay out of the table.
    if (this.type === "bungee") return { bodyY: -alt, clipHeight: CLIP_OFF };
    return { bodyY: -alt, clipHeight: CLIP_OFF };
  }
  hitX() { return this.zombieRect().x; }
  hitW() { return this.zombieRect().w; }
  aimX() { const r = this.zombieRect(); return r.x + r.w / 2; }
  hitCX() { const r = this.zombieRect(); return r.x + r.w / 2; }
  isFlying() { return this.type === "balloon" && this.flying; } // Zombie::IsFlying (9555)
  isFireResistant() { // Zombie::IsFireResistant (8422)
    if (this.type === "catapult" || this.type === "zamboni") return true;
    if (this.type === "door" && this.shield > 0) return true;
    if (this.type === "ladder" && this.ladder > 0) return true;
    return false;
  }
  // Zombie::ZombieTargetLeadX (Zombie.cpp:3814): future rect-center X after
  // theTime ticks at the current (possibly chilled) walk speed. Allies walk
  // backwards; eating/buttered zombies stand still (ZombieNotWalking 3837 —
  // exotic phases unmodeled, noted).
  zombieTargetLeadX(t) {
    let sp = this.velX;
    if (this.chill > 0) sp *= 0.5; // CHILLED_SPEED_FACTOR
    if (this.isDiggerBackwards()) sp = -sp; // IsWalkingBackwards (+ ally)
    if (this.zombieNotWalking()) sp = 0; // ZombieNotWalking (full gate incl. digger phases)
    const r = this.zombieRect();
    return (r.x + r.w / 2) - sp * t;
  }
  // Zombie::EffectedByDamage (Zombie.cpp:8037): dead/mowed (DAMAGES_DYING
  // gate), mind-control, bungee dive (only the grabbed bottom is hittable),
  // bobsled followers (only the leader), the OFF_GROUND leap/transition
  // phases (vault, grave rise, dolphin/snorkel transitions, sled crash,
  // dancer rise), offscreen spawn, pool-submerged snorkel, tunneling digger,
  // flying balloon, else the ground gate. Boss head-phase gating, digger
  // rise/stun, imp thrown/landing, balloon popping and high-ground rows are
  // unmodeled, noted.
  // Zombie::IsBungeeOnLawn proxy: only the landed bottom (and the grab/ouchy
  // tail of it) counts as on the lawn — divers, screamers and risers are still
  // in the sky (EffectedByDamage 6370-6372, HasShadow/CanBeFrozen gates).
  bungeeOnLawn() { return this.type === "bungee" && (this.bungeeState === "bottom" || this.bungeeState === "grabbing" || this.bungeeState === "ouchy"); }
  effectedByDamage(f) {
    const bit = (n) => (f >> n) & 1;
   // IsDeadOrDying (9597): dead + dying + BURNED + mowed. Mowed zombies are
   // still !dead in this port until the flip ends, hence the explicit gate.
    // The flat-tired zamboni's 280-tick wheelie runs PHASE_ZOMBIE_DYING with
    // dead still false (TakeDamage 7923 + IsDeadOrDying 9597 both count DYING),
    // so the phase rides the gate too — otherwise peas/lobs keep colliding
    // with the dying machine (consumed for no damage, since takeDamage also
    // early-returns on zdying) instead of passing through like source.
    if (!bit(5) && (this.dead || this.mowed || this.burnT > 0 || this.phase === "zdying")) return false; // IsDeadOrDying
    if (bit(7)) return !!this.ally; // DAMAGES_ONLY_MINDCONTROLLED
    if (this.ally) return false;
    if (this.type === "bungee" && !this.bungeeOnLawn()) return false;
    if (this.type === "bobsled" && this.parent) return false; // GetBobsledPosition() > 0
    if (this.phase === "invault" || this.vaultT > 0) return !!bit(4); // vault leap
    // Zombie::EffectedByDamage (Zombie.cpp:7998): rising-from-grave zombies
    // only take DAMAGES_OFF_GROUND (peas pass through).
    if (this.phase === "rising") return !!bit(4);
    // Zombie::EffectedByDamage off-ground phases (Zombie.cpp:8091-8105): the
    // transition/leap phases only take DAMAGES_OFF_GROUND — notably a dolphin
    // mid-jump (inPool true) is NOT a tangle-kelp target (bit 4 unset in the
    // tangle's flags 5), and peas pass through all of these. Digger rise/stun
    // + imp thrown/landing are unmodeled phases (noted). Balloon popping is
    // in the source list (EffectedByDamage 8099) — jack popping is NOT (the
    // jack's pop takes every category; TakeDamage's own popping gate is the
    // immunity), so the "popping" phase below is balloon-gated: cactus
    // (DR_FLYING) stops tracking a popped balloon while OFF_GROUND weapons
    // still connect — isFlying() stays true through popping for the
    // TakeDamage routing (TakeFlyingDamage flash + pool) and the other
    // IsFlying gates.
    if (this.phase === "dolphin-into-pool" || this.phase === "dolphin-jump" ||
        this.phase === "snorkel-into-pool" || this.phase === "crashing" ||
        (this.phase === "popping" && this.type !== "jack") || this.phase === "dancerise" ||
        this.phase === "digrise" || this.phase === "digpause" || this.phase === "digrisenoaxe") return !!bit(4); // digger rise family (8091-8105; stun/walk stay hittable)
    const r = this.zombieRect();
    if (this.type !== "bobsled" && r.x > BOARD_W) return false; // offscreen spawn
    // EffectedByDamage SUBMERGED (Zombie.cpp): mInPool waders, not the pool-row
    // tube flag — a snorkel walking to the pool (swimming true, inPool false)
    // is still a ground target.
    const submerged = this.type === "snorkel" && this.inPool && !this.eating;
    if (bit(2) && submerged) return true;
    const underground = this.phase === "tunnel"; // PHASE_DIGGER_TUNNELING only (tunnel is the underground phase)
    if (bit(6) && underground) return true;
    if (bit(1) && this.isFlying()) return true;
    return !!bit(0) && !this.isFlying() && !submerged && !underground;
  }
  // Zombie::ApplyChill (Zombie.cpp:7461): snow-pea freeze is 1000 ticks,
  // ice-trap freeze 2000 (theIsIceTrap) — max(), never shorten.
  // CanBeChilled gates (Zombie.cpp:7986), reduced to the modeled state:
  // vehicles-with-sled (zamboni chillImmune; bobsled teams ride intact —
  // the crash unlinks them, and crash-unlinked members chill normally),
  // the mind-controlled and (like the dive phases) the still-diving bungee
  // never chill. Boss only chills in head phases — no boss phases in scope,
  // so the boss never chills (noted).
  chillFor(ticks) {
    if (ROSTER[this.type].chillImmune) return;
    if (this.dead || this.mowed || this.ally || this.phase === "tunnel") return; // tunneling diggers never chill
    // Zombie::CanBeChilled: sled teams ride intact (the crash unlinks them).
    if (this.type === "bobsled" && this.bobsledPosition() !== -1) return; // team-with-sled (crash unlinks)
    if (this.type === "boss") return; // head-phase-only (unmodeled)
    if (this.phase === "rising" || this.phase === "dancerise" || this.phase === "digrise" || this.phase === "digpause" || this.phase === "digrisenoaxe") return; // grave/dance/digger-rise family (CanBeChilled 7986)
    if (this.type === "bungee" && !this.bungeeOnLawn()) return;
    // ApplyChill (7466-7469): FOLEY_FROZEN plays on the unchilled -> chilled
    // transition only — first snow-pea hit dings, refresh hits stay silent.
    if (this.chill === 0) this.board.sfx("frozen");
    this.chill = Math.max(this.chill, ticks);
    this.updateAnimSpeed();
  }
  // Zombie::HitIceTrap (Zombie.cpp:7440): the full freeze. Chill 2000 through
  // the CanBeChilled gate above, then the freeze itself through CanBeFrozen
  // (7984): pole-vaulters mid-leap, divers, fliers, thrown imps, crashing
  // sleds, popping jacks and non-bottom bungees never freeze (unmodeled
  // phases noted inline). Pool waders freeze flat 300 (no pool in scope, so
  // the swimming proxy never fires — noted); already-cold zombies refreeze
  // short 300-400, fresh ones 400-600. Then the dancer sting check, 20 damage
  // that bypasses shields (flags 1U, WITH flash), and a re-rate.
  hitIceTrap() {
    const wasCold = this.chill > 0 || this.iceTrap > 0;
    this.chillFor(2000); // ApplyChill(true): gated + FROZEN ding + max()
    if (!this.canBeFrozen()) return;
    // HitIceTrap mInPool branch (Zombie.cpp:7440): pool waders freeze flat 300.
    if (this.inPool) this.iceTrap = 300;
    else if (wasCold) this.iceTrap = 300 + Math.floor(Math.random() * 101); // RandRangeInt(300,400)
    else this.iceTrap = 400 + Math.floor(Math.random() * 201); // RandRangeInt(400,600)
    this.stopDancerSound(); // StopZombieSound (frozen dancers hold the sting otherwise)
    // Zombie::HitIceTrap (8374): StopZombieSound — the ice-trapped jack's
    // crank stops (RemoveIceTrap restarts it on the thaw above). Popping
    // jacks return before this (canBeFrozen false), so the fuse song plays on.
    this.stopJackSong();
    this.stopDiggerSong(); // StopZombieSound (8374): tunneling song stops on freeze
    this.takeDamage(20, DMG_BYPASS); // TakeDamage(20, 1U): bypasses shield, flashes
    this.updateAnimSpeed(); // IsImmobilizied zeroes the rate below
  }
  // Zombie::CanBeFrozen (Zombie.cpp:7984), reduced to the modeled state.
  canBeFrozen() {
    if (this.type === "zamboni" || this.type === "boss") return false;
    // Zombie::CanBeFrozen: sled teams ride intact (the crash unlinks them).
    if (this.type === "bobsled" && this.bobsledPosition() !== -1) return false;
    if (this.dead || this.mowed || this.ally) return false;
    if (this.phase === "tunnel" || this.phase === "rising" || this.phase === "dancerise" || this.phase === "digrise" || this.phase === "digpause" || this.phase === "digrisenoaxe") return false;
    if (this.vaultT > 0 || this.phase === "invault") return false; // mid-vault pole
    if (this.flying) return false; // balloon up top
    if (this.type === "bungee" && !this.bungeeOnLawn()) return false;
    // Zombie::CanBeFrozen (Zombie.cpp:8018-8030): pole-vaulters mid-leap, the
    // dive transitions (snorkel/dolphin into-pool, dolphin jump), divers and
    // fliers never freeze. Still-unmodeled phases (imp thrown/landing,
    // squash phases, sled crash while linked) stay noted, never gated.
    if (this.phase === "snorkel-into-pool" || this.phase === "dolphin-into-pool" || this.phase === "dolphin-jump") return false;
    // Zombie::CanBeFrozen (8018-8030, same list): popping jacks never freeze
    // either — the fuse keeps burning under snow, the crank keeps playing.
    if (this.type === "jack" && this.phase === "popping") return false;
    return true;
  }
  // Zombie::RemoveIceTrap (Zombie.cpp:7529): counter clear, re-rate, song
  // restart (jack/digger songs are one-shots here — no-op, noted). The thaw
  // burst (PARTICLE_ICE_TRAP_RELEASE) fires at the call site in UpdatePlaying.
  removeIceTrap() {
    this.iceTrap = 0;
    this.updateAnimSpeed();
    // Thaw restarts the digger song for tunneling diggers (source parity; one-shot no-op in practice).
    if (this.type === "digger" && this.phase === "tunnel" && this.hasHead) this.startDiggerSong();
    // Zombie::RemoveIceTrap (8336-8346): the thaw restarts the loop for a
    // headed running jack (StartZombieSound runs the RUNNING+head gate
    // itself — the phase check below is that gate).
    if (this.type === "jack" && this.phase === "running" && this.hasHead) this.startJackSong();
  }
  // Zombie::RemoveColdEffects (Zombie.cpp:8618): ice-trap release + chill
  // clear (both re-rate via UpdateAnimSpeed). Fire (DoImpact 819, BurnRow
  // 4272) and thaw paths funnel here.
  removeColdEffects() {
    if (this.iceTrap > 0) this.removeIceTrap();
    if (this.chill > 0) { this.chill = 0; this.updateAnimSpeed(); }
  }
  // Zombie::ApplyButter (Zombie.cpp:8483): 400-tick full freeze; the zamboni,
  // boss, fliers, sled teams and headless can't be buttered — nor the
  // mind-controlled allies (CanBeFrozen -> CanBeChilled false for 8002/8003).
  applyButter() {
    const t = this.type;
    if (this.ally) return;
    if (!this.hasHead) return;
    // Zombie::ApplyButter (8485): everything runs through CanBeFrozen —
    // mid-leap vaulters, divers, fliers and the rest can't be buttered.
    if (!this.canBeFrozen()) return;
    if (!this.body.trackExists("anim_death") || t === "zamboni" || t === "boss" || this.flying) return;
    // Zombie::ApplyButter (Zombie.cpp:8483): grabbed victims can't be
    // buttered (IsTangleKelpTarget in the gate list).
    if (this.isTangleKelpTarget()) return;
    // Zombie::CanBeFrozen: sled teams ride intact (the crash unlinks them).
    if (t === "bobsled" && this.bobsledPosition() !== -1) return;
    this.butter = BUTTER_TICKS;
    this.updateAnimSpeed();
    // Zombie::ApplyButter (8520-8521): buttering stops the loop (the rate
    // freezes at 0 above; RemoveButter restarts it on wear-off in update()).
    this.stopJackSong();
    this.stopDiggerSong();
  }
  // Zombie::TakeDamage (Zombie.cpp:7921): flying pool first, then the shield
  // pool (skipped by DAMAGE_BYPASSES_SHIELD), then helm, then body.
  // DAMAGE_HITS_SHIELD_AND_BODY re-deals the FULL damage to helm/body after
  // the shield (splash); freeze/chill ride inside the helm/body takes.
  damage(amount, board, flags = 0) { return this.takeDamage(amount, flags); }
  takeDamage(amount, flags = 0) {
    // TakeDamage (7923): dead/dying/mowed immune (burned rides the bent
    // IsDeadOrDying gate). The flat-tired zamboni runs PHASE_ZOMBIE_DYING
    // (phase "zdying") and takes no further damage.
    if (this.dead || this.mowed || this.burnT > 0 || this.phase === "zdying") return;
    // TakeDamage (7923): a popping jack is immune to ALL damage — peas,
    // splash, squash, cherry, doom, mowers (all funnel through here).
    if (this.type === "jack" && this.phase === "popping") return;
    this.lastFlags = flags;
    let rest = amount;
    if (this.isFlying()) rest = this.takeFlyingDamage(rest, flags);
    if (rest > 0 && (this.shield > 0 || this.paper > 0 || this.ladder > 0) && !(flags & DMG_BYPASS)) {
      rest = this.takeShieldDamage(rest, flags);
      if (flags & DMG_HITS_BOTH) rest = amount;
    }
    if (rest > 0 && this.helm > 0) rest = this.takeHelmDamage(rest, flags);
    if (rest > 0) this.takeBodyDamage(rest, flags);
  }
  // Plant::UpdateBowling pool-targeted hits (Plant.cpp:2446-2466): unlike
  // TakeDamage above (which cascades shield->helm->body), these damage ONE
  // pool only, capped at that pool's remaining health — the remainder is
  // DISCARDED (the source return value is ignored by the caller). Flash:
  // shield hits set shieldShot (TakeShieldDamage 7546), helm/body hits set
  // justShot (TakeHelmDamage 7668 / TakeBodyDamage), both gated on
  // !DOESNT_CAUSE_FLASH (bit 3). Stages/drops mirror damage().
  takeShieldDamage(amount, flags = 0) {
    if (this.dead || this.mowed || this.burnT > 0) return amount;
    this.lastFlags = flags;
    const noFlash = (flags & DMG_NOFLASH) !== 0;
    if (!noFlash) {
      this.shieldShot = 25;
      if (this.justShot < 0) this.justShot = 0; // TakeShieldDamage 7549
    }
    // TakeShieldDamage (7555): shield hits knock the shield back unless the
    // hit neither flashes nor shakes. Only door/ladder play SHIELD_HIT here —
    // the newspaper rip is silent until the pool breaks (DropShield 7522).
    if (!noFlash && !(flags & DMG_HITS_BOTH)) {
      this.shieldRecoil = 12;
      if (this.type === "door" || this.type === "ladder") this.board.sfx(Math.random() < 0.5 ? "shieldhit" : "shieldhit2");
    }
    // door / newspaper / ladder ARE the shield pool for those types.
    let pool = 0;
    if (this.type === "door") pool = this.shield;
    else if (this.type === "news") pool = this.paper;
    else if (this.type === "ladder") pool = this.ladder;
    else if (this.shield > 0) pool = this.shield;
    if (!(pool > 0)) return amount;
    const hit = Math.min(pool, amount);
    if (this.type === "door") { this.shield -= hit; if (this.shield <= 0) this.dropShield(flags); else this.applyArmorStage(); }
    else if (this.type === "news") { this.paper -= hit; if (this.paper <= 0) this.dropShield(flags); else this.applyArmorStage(); }
    else if (this.type === "ladder") { this.ladder -= hit; if (this.ladder <= 0) this.dropShield(flags); else this.applyArmorStage(); }
    else { this.shield -= hit; if (this.shield <= 0) this.dropShield(flags); else this.applyArmorStage(); }
    return amount - hit;
  }
  takeHelmDamage(amount, flags = 0) {
    if (this.dead || this.mowed || this.burnT > 0) return amount;
    this.lastFlags = flags;
    const noFlash = (flags & DMG_NOFLASH) !== 0;
    if (!noFlash) this.justShot = 25; // TakeHelmDamage 7668
    if (!(this.helm > 0)) return amount;
    if (flags & DMG_FREEZE) this.chillFor(CHILL_TICKS); // TakeHelmDamage 7677
    const hit = Math.min(this.helm, amount);
    this.helm -= hit;
    if (this.helm <= 0) {
      this.dropHelm(flags);
      // Zombie::DropHelm HELMTYPE_BOBSLED (Zombie.cpp:7651): a body-leaving
      // hit on the leader's 300-hp sled pool crashes the whole team.
      if (this.type === "bobsled" && !(flags & DMG_NOLEAVE)) this.bobsledCrash();
      return amount - hit;
    }
    this.applyArmorStage();
    return 0;
  }
  // Zombie::GetBodyDamageIndex (Zombie.cpp:52D710): 0 intact, 1 below 2/3,
  // 2 below 1/3 (integer division; the boss uses halves, unmodeled here
  // since the boss never renders stages). Shared by the zamboni art stages
  // and the bobsled damage status.
  bodyDamageIndex() {
    if (this.hp < Math.floor(this.maxHp / 3)) return 2;
    if (this.hp < Math.floor((this.maxHp * 2) / 3)) return 1;
    return 0;
  }
  // Zombie::TakeBodyDamage ZAMBONI branch (Zombie.cpp:7787-7838): every hit
  // plays SHIELD_HIT unless it neither flashes nor shakes; the damage lands
  // first, then spike forces the DAMAGE2 art + ZamboniDeath, lethal damage
  // goes to ZamboniDeath, and stage changes swap the _1/_2 machine cels
  // (stage 2 also pins a smoke system at (27,72)).
  takeZamboniDamage(amount, flags, noFlash) {
    if (this.phase === "zdying") return; // IsDeadOrDying: the wheelie already runs
    if (!noFlash) this.board.sfx(Math.random() < 0.5 ? "shieldhit" : "shieldhit2");
    const before = this.bodyDamageIndex();
    this.hp -= amount;
    const after = this.bodyDamageIndex();
    if (flags & DMG_SPIKE) {
      this.body.setImageOverrideByKey("Zombie_zamboni_1", "IMAGE_REANIM_ZOMBIE_ZAMBONI_1_DAMAGE2");
      this.body.setImageOverrideByKey("Zombie_zamboni_2", "IMAGE_REANIM_ZOMBIE_ZAMBONI_2_DAMAGE2");
      this.zamboniDeath(flags);
      return;
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.zamboniDeath(flags);
      return;
    }
    if (after !== before) {
      if (after === 1) {
        this.body.setImageOverrideByKey("Zombie_zamboni_1", "IMAGE_REANIM_ZOMBIE_ZAMBONI_1_DAMAGE1");
        this.body.setImageOverrideByKey("Zombie_zamboni_2", "IMAGE_REANIM_ZOMBIE_ZAMBONI_2_DAMAGE1");
      } else if (after === 2) {
        this.body.setImageOverrideByKey("Zombie_zamboni_1", "IMAGE_REANIM_ZOMBIE_ZAMBONI_1_DAMAGE2");
        this.body.setImageOverrideByKey("Zombie_zamboni_2", "IMAGE_REANIM_ZOMBIE_ZAMBONI_2_DAMAGE2");
        this.board.spawnZamSmoke(this.x + 27, this.y + 72, this);
      }
    }
  }
  takeBodyDamage(amount, flags = 0) {
    if (this.dead || this.mowed || this.burnT > 0) return;
    this.lastFlags = flags;
    const noFlash = (flags & DMG_NOFLASH) !== 0;
    if (!noFlash) this.justShot = 25;
    if (flags & DMG_FREEZE) this.chillFor(CHILL_TICKS); // TakeBodyDamage 7778
    if (this.type === "zamboni") { this.takeZamboniDamage(amount, flags, noFlash); return; }
    // DAMAGE_SPIKE vs the catapult: retail swaps the art and explodes the
    // machine (TakeBodyDamage 7787-7838, same shape as the zamboni above).
    // No catapult art stages ship in this port (out of the 1-9 scope), so
    // the spike just kills it.
    if ((flags & DMG_SPIKE) && this.type === "catapult") {
      this.hp = 0; this.updateDamageStates(); this.die(); return;
    }
    this.hp -= amount;
    this.updateDamageStates();
    if (this.hp <= 0) {
      this.hp = 0;
      // Zombie::PlayDeathAnim DOESNT_LEAVE_BODY branch (8874): victims that
      // are neither boss nor garg skip the fall entirely — DieNoLoot +
      // DropLoot, i.e. removed on the spot with no anim_death, no debris
      // (DropHead/DropArm already hid everything above without spawning,
      // via the updateDamageStates flag threading), no thud, no fade. This
      // is the potato-mine path (TakeDamage(1800, 18U) from
      // KillAllZombiesInRadius, burn=false). Boss/garg fall through to the
      // normal fall (vehicles never reach here in the 1-9 scope, but they
      // keep the old behavior too — retail kills them via their own
      // explosion handlers, not PlayDeathAnim).
      if ((flags & DMG_NOLEAVE) && this.type !== "boss" && this.type !== "garg" &&
          this.type !== "zamboni" && this.type !== "catapult") {
        // PlayDeathAnim (8895-8903): a frozen victim bursts its thaw shards
        // (PARTICLE_ICE_TRAP_RELEASE at +75/+106) and the trap clears
        // SILENTLY (direct zero, not RemoveIceTrap) ahead of the NOLEAVE
        // early return — chill/butter/yucky clear with it.
        if (this.iceTrap > 0) { this.board.spawnIceRelease(this.x + 75, this.y + 106); this.iceTrap = 0; }
        this.butter = 0; this.chill = 0;
        this.yucky = 0;
        this.stopEating();
        this.dieWithLoot();
        return;
      }
      this.die();
      return;
    }
  }
  // Zombie::TakeFlyingDamage (Zombie.cpp:7752): the balloon's 20-HP propeller
  // pool pops first; the remainder continues into shield/helm/body.
  takeFlyingDamage(amount, flags = 0) {
    if (this.dead || this.mowed || this.burnT > 0) return amount;
    this.lastFlags = flags;
    if (!(flags & DMG_NOFLASH)) this.justShot = 25;
    if (!(this.flyingHp > 0)) return amount;
    const hit = Math.min(this.flyingHp, amount);
    this.flyingHp -= hit;
    if (this.flyingHp <= 0) this.landFlyer(flags);
    return amount - hit;
  }
  landFlyer(flags) { // Zombie::LandFlyer (Zombie.cpp): the popped balloon walks from here
    if (this.type !== "balloon") return;
    // DOESNT_LEAVE_BODY (16) skips the pop (mower/cherry-grade kills); the
    // land/drown half below runs regardless of the phase gate.
    if (!(flags & 16) && this.phase === "flying") {
      this.board.sfx("balloonpop"); // SOUND_BALLOON_POP (flat PlaySample)
      this.phase = "popping"; // PHASE_BALLOON_POPPING
      this.playZombie("anim_pop", PLAY_ONCE_AND_HOLD, 20, 24);
    }
    // Pool rows drown it outright (PLANTROW_POOL -> DieWithLoot); elsewhere
    // the body drops out of the sky (HEIGHT_FALLING, UpdateZombieFalling
    // ticks altitude down in updateZombiePool). The airborne flag stays set
    // through PHASE_BALLOON_POPPING and only clears on the popping -> walking
    // transition in updateFlyer: Zombie::IsFlying (9555) is FLYING || POPPING,
    // so peas (ground-only) still miss the falling balloon and only
    // OFF_GROUND hits land, exactly like source (EffectedByDamage 8099).
    if (this.board.isWaterRow(this.row)) this.dieWithLoot();
    else this.height = "falling";
  }
  // Zombie::UpdateZombieFlyer (Zombie.cpp, balloon branch; the high-gravity
  // and IZombie gates are out-of-scope modes): a popped balloon walks once
  // the pop layer loops through. Runs in the UpdateActions slot, ahead of
  // walking/targeting like the other per-type phase machines.
  updateFlyer() {
    if (this.phase === "popping" && this.body.loopCount > 0) {
      this.phase = "walking"; // PHASE_BALLOON_WALKING
      this.flying = false; // IsFlying (9555) ends here: FLYING || POPPING
      this.startWalkAnim(0);
    }
  }
  // Zombie::CanLoseBodyParts (3380): vehicles/fliers/sled-teams keep theirs.
  canLoseBodyParts() {
    const t = this.type;
    if (t === "zamboni" || t === "bungee" || t === "catapult" || t === "garg" || t === "boss") return false;
    // Zombie::IsBobsledTeamWithSled: a linked team never loses parts.
    if (t === "bobsled" && this.bobsledPosition() !== -1) return false;
    if (this.flying) return false; // balloon
    return true;
  }
  // ---- dancing zombie (Zombie.cpp:2778-3013, 3837-3906, 6071-6109, 6507-6560) ----
  // The troupe shares one global beat: GetDancerFrame derives it from the app
  // counter (6071-6096; 20-tick frames x23 over 460 ticks, or 10-tick x11
  // while DANCING_IN), immobilized dancers sit on frame 0. The port's
  // board.tick is the counter (previews never dance, so no UI-wave branch).
  dancerFrame() {
    if (this.butter > 0 || this.iceTrap > 0) return 0; // IsImmobilizied
    const dancein = this.phase === "dancein";
    const len = dancein ? 10 : 20, count = dancein ? 11 : 23;
    return Math.floor((this.board.tick % (len * count)) / len);
  }
  // GetDancerPhase (6099-6109): frame<=11 LEFT, 12 WALK_TO_RAISE, 13-15
  // RIGHT_1, 16-18 LEFT_1, 19-21 RIGHT_2, 22 LEFT_2.
  dancerPhaseFor() {
    const f = this.dancerFrame();
    if (f <= 11) return "danceleft";
    if (f <= 12) return "walktoraise";
    if (f <= 15) return "raiseR1";
    if (f <= 18) return "raiseL1";
    if (f <= 21) return "raiseR2";
    return "raiseL2";
  }
  // The troupe leader: the dancer itself, or the backup's linked leader while
  // it lives (ZombieTryToGet(mRelatedZombieID) at 3884/6521).
  danceLeader() {
    if (this.type === "dancer") return this;
    const L = this.related;
    return (L && !L.dead && !L.gone) ? L : null;
  }
  liveFollower(i) {
    const d = this.followers[i];
    return (d && !d.dead && !d.gone) ? d : null;
  }
  // Zombie::ZombieNotWalking dance half (3837-3903): the snap/hold/rise/raise
  // phases root the dancer, and the whole troupe freezes while the leader OR
  // any live follower eats or is buttered (an orphaned backup whose leader
  // died keeps walking). Non-dance phases fall through to the shared gates.
  zombieNotWalking() {
    if (this.eating || this.butter > 0 || this.iceTrap > 0) return true;
    // Zombie::ZombieNotWalking chimney half (3861): a winner sinking into the
    // roof chimney never walks (UpdateZombieChimney drives altitude instead).
    if (this.height === "chimney") return true;
    const ph = this.phase;
    // Zombie::ZombieNotWalking digger half (3878-3902): rise/stun/pause/rise-no-axe root the digger.
    if (ph === "digrise" || ph === "digstun" || ph === "digpause" || ph === "digrisenoaxe") return true;
    // Zombie::ZombieNotWalking (3837-3844): a popping jack stands still while
    // the box blows (same gate family as maddening/garg-smash/etc. below) —
    // without this the pop anim walks down the lawn.
    if (this.type === "jack" && ph === "popping") return true;
    if (ph === "snap" || ph === "snaplight" || ph === "snaphold" || ph === "dancerise" ||
        ph === "walktoraise" || ph === "raiseL1" || ph === "raiseR1" || ph === "raiseL2" || ph === "raiseR2" ||
        ph === "maddening") return true;
    const t = this.type;
    if (t === "dancer" || t === "backup") {
      const L = t === "dancer" ? this : this.danceLeader();
      if (L) {
        if (L.eating || L.butter > 0 || L.iceTrap > 0) return true;
        for (let i = 0; i < 4; i++) {
          const d = L.liveFollower(i);
          if (d && (d.eating || d.butter > 0 || d.iceTrap > 0)) return true;
        }
      }
    }
    return false;
  }
  // Zombie::IsWalkingBackwards digger half (Zombie.cpp:4980): diggers walk
  // backwards in RISING/STUNNED/WALKING; the dying/burned/mowed branch
  // returns mHasObject (forward once the axe is stolen); everything else
  // (incl. digwalknoaxe/pause/rise-no-axe) walks forward. Allies always walk backwards.
  isDiggerBackwards() {
    if (this.ally) return true;
    if (this.type !== "digger") return false;
    if (this.phase === "digrise" || this.phase === "digstun" || this.phase === "digwalk") return true;
    if (this.phase === "dying" || this.burnT > 0 || this.mowed) return !!this.hasObject;
    return false;
  }
  // IsMovingAtChilledSpeed dance half (6507-6543): the whole troupe slows
  // while ANY member is chilled (the bite cadence stays per-zombie).
  isChilledSpeed() {
    if (this.chill > 0) return true;
    const t = this.type;
    if (t === "dancer" || t === "backup") {
      const L = t === "dancer" ? this : this.danceLeader();
      if (L) {
        if (L.chill > 0) return true;
        for (let i = 0; i < 4; i++) {
          const d = L.liveFollower(i);
          if (d && d.chill > 0) return true;
        }
      }
    }
    return false;
  }
  // StopZombieSound dancer half (7419-7443): the DANCER sting stops when no
  // headed living on-board dancer/backup remains. Keeper test is source-
  // exact: mHasHead && !IsDeadOrDying() && IsOnBoard() && type — notably NO
  // ally exclusion (a hypno'd dancer keeps the music in retail), and NO head
  // requirement on the caller (a headless death still stops it for the rest).
  // Model mapping: dead covers mDead + the DYING fall (die() sets it at fall
  // start); gone covers removed-but-listed; mowed covers PHASE_ZOMBIE_MOWERED
  // (the flip "lives" with dead unset until the driver loops); burnT covers
  // PHASE_ZOMBIE_BURNED (dead only lands at DieWithLoot); row>=0 covers
  // IsOnBoard (fromWave CUTSCENE/UI — street zreans never enter board.zombies).
  // (The mPlayingSong half is jack/digger-only; this port's sfx are one-shots.)
  stopDancerSound() {
    const t = this.type;
    if (t !== "dancer" && t !== "backup") return;
    for (const z of this.board.zombies) {
      if ((z.type === "dancer" || z.type === "backup") && z.hasHead && !z.dead && !z.gone &&
          !z.mowed && z.burnT <= 0 && z.row >= 0) return;
    }
    try { this.board.libs.stopSting(); } catch (e) { /* headless */ }
  }
  // Zombie::SummonBackupDancer (2778-2812): row gate, AddZombie in the
  // dancer's wave at the exact slot, buried at -200 rising over 150 ticks,
  // linked to the leader, frozen rate, mind-control inherited, dirt burst +
  // GRAVESTONE_RUMBLE at (x+60, y+110).
  summonBackupDancer(row, x) {
    const b = this.board;
    if (row < 0 || row >= b.rows) return null;
    if (!b.rowCanHaveZombieType("backup", row)) return null;
    const z = b.spawnZombie("backup", row, this.wave, x);
    z.y = zombieRowY(b.bg, z.x, row, "backup");
    z.altitude = -200; // ZOMBIE_BACKUP_DANCER_RISE_HEIGHT (Zombie.h:28)
    z.phase = "dancerise";
    z.phaseT = 150;
    z.related = this;
    z.origRate = 0; z.body.animRate = 0; // SetAnimRate(0) (2798)
    z.ally = this.ally; // mMindControlled inherit (2799)
    // PARTICLE_DANCER_RISE stand-in: no DancerRise art ships in main.zip, so
    // the grave-dirt splash burst fires instead (same documented stand-in
    // shape as the potato-mine rise burst).
    b.spawnGraveDirt("splash", Math.round(z.x) + 60, Math.round(z.y) + 110, row);
    b.sfx("rumble"); // FOLEY_GRAVESTONE_RUMBLE (2809, pitch 10)
    return z;
  }
  // Zombie::SummonBackupDancers (2815-2837): headed only; each empty slot
  // summons at its fixed offset (up/down row at x, same row at x-100/+100).
  summonBackupDancers() {
    if (!this.hasHead) return;
    for (let i = 0; i < 4; i++) {
      if (this.liveFollower(i)) continue;
      let row, x;
      if (i === 0) { row = this.row - 1; x = this.x; }
      else if (i === 1) { row = this.row + 1; x = this.x; }
      else if (i === 2) { row = this.row; x = this.x - 100; }
      else { row = this.row; x = this.x + 100; }
      this.followers[i] = this.summonBackupDancer(row, x);
    }
  }
  // Zombie::NeedsMoreBackupDancers (2840-2861): any empty slot whose row could
  // host a backup (slots 0/1 skip invalid rows).
  needsMoreBackupDancers() {
    for (let i = 0; i < 4; i++) {
      if (this.liveFollower(i)) continue;
      if (i === 0 && (this.row - 1 < 0 || !this.board.rowCanHaveZombieType("backup", this.row - 1))) continue;
      if (i === 1 && (this.row + 1 >= this.board.rows || !this.board.rowCanHaveZombieType("backup", this.row + 1))) continue;
      return true;
    }
    return false;
  }
  // Zombie::UpdateZombieBackupDancer (2879-2922): eating gates everything;
  // RISING climbs linearly (-200 to 0 over the counter) and holds until the
  // counter hits 0; otherwise the beat phase is mirrored (walk@0, armraise@18
  // with the walk-to-raise pose starting at animTime 0.6).
  updateBackupDancer() {
    if (this.phase === "dancerise") {
      // TodAnimateCurve(150, 0, counter, -200, 0, LINEAR).
      this.altitude = -200 * this.phaseT / 150;
      if (this.phaseT !== 0) return;
      // No high ground in scope (day lawns); retail lands HIGH_GROUND_HEIGHT.
    }
    const dp = this.dancerPhaseFor();
    if (dp !== this.phase) this.playDancePhase(dp);
  }
  playDancePhase(dp) {
    this.phase = dp;
    if (dp === "danceleft") this.playZombie("anim_walk", LOOP, 10, 0);
    else if (dp === "walktoraise") {
      this.playZombie("anim_armraise", LOOP, 10, 18);
      try { this.body.animTime = 0.6; } catch (e) { /* headless */ }
    } else this.playZombie("anim_armraise", LOOP, 10, 18);
  }
  // Zombie::UpdateZombieDancer (2925-3013): eating gates everything. The
  // summon counter retries every tick until the beat lands on frame 12
  // (headed, x<700); WITH_LIGHT when the random poll fires, plain after the
  // DANCING_IN walk-in. The completed point summons the troupe (plain snaps
  // fire the FOLEY_DANCER sting with <= 15 on screen), holds 200 ticks, then
  // rejoins the beat; empty slots re-summon every 100 ticks. Headless dancers
  // keep mirroring the beat but never summon.
  updateDance() {
    const t = this.type;
    if (t !== "dancer" && t !== "backup") return;
    if (this.eating) return; // (2927/2881)
    if (t === "backup") { this.updateBackupDancer(); return; }
    if (this.summonCd > 0) {
      if (--this.summonCd === 0) {
        if (this.dancerFrame() === 12 && this.hasHead && this.x < 700) {
          this.phase = "snaplight";
          this.playZombie("anim_point", PLAY_ONCE_AND_HOLD, 20, 24);
        } else this.summonCd = 1;
      }
    }
    if (this.phase === "dancein") {
      if (this.hasHead && this.phaseT === 0) {
        this.phase = "snap";
        this.playZombie("anim_point", PLAY_ONCE_AND_HOLD, 20, 24);
        this.pickRandomSpeed();
      }
    } else if (this.phase === "snap" || this.phase === "snaplight") {
      if (this.body.loopCount > 0) {
        if (this.phase === "snap" && this.board.countZombiesOnScreen() <= 15)
          this.board.sting(); // FOLEY_DANCER (2963)
        this.summonBackupDancers();
        this.phase = "snaphold"; this.phaseT = 200;
      }
    } else {
      if (this.phase === "snaphold") {
        if (this.phaseT !== 0) return;
        this.phase = "danceleft";
        this.playZombie("anim_walk", LOOP, 20, 0);
        // USER OVERRIDE (rigid formation): restart every live follower's beat
        // layer alongside the leader so the whole troupe shares one walk
        // phase. The leader's walk anim always restarts fresh here while
        // survivors/newcomers sit mid-layer, so without this their
        // instantaneous ground velocities differ for the rest of the beat:
        // every summon exit kicked the leader a few px ahead (+0.7 initial,
        // +3-8 per re-summon, accumulating while survivors never re-anchor).
        // Rising/eating followers are skipped (replay would cancel the rise
        // altitude / clobber the chew anim; both re-sync naturally later).
        for (let i = 0; i < 4; i++) {
          const d = this.liveFollower(i);
          if (d && d.phase !== "dancerise" && !d.eating) d.playDancePhase(d.dancerPhaseFor());
        }
      }
      const dp = this.dancerPhaseFor();
      if (dp !== this.phase) this.playDancePhase(dp);
      if (this.hasHead && this.summonCd === 0 && this.needsMoreBackupDancers())
        this.summonCd = 100;
    }
  }
  // Zombie::UpdateZombieSnorkel (Zombie.cpp:1880): the land->pool->eat machine.
  // Walking hits the pool edge (700<x<=720) and jumps in (velX 0.2,
  // anim_jumpinpool@16); at timed event 0.83 the splash + ENTERING_WATER fire
  // and the loop lands swimming (inPool, anim_swim@12). Eating (mIsEating)
  // surfaces (up-to-eat@24 -> eating -> down-from-eat reversed@-24 -> swim);
  // the pool exits at x<=25 (or x>640 backwards) with PoolSplash + walk.
  // Headless zombies in the pool drown on the spot (1915-1917, DieNoLoot).
  updateSnorkel() {
    if (this.type !== "snorkel" || this.dead) return;
    const backwards = this.ally;
    const b = this.board;
    if (this.phase === "snorkel-walk" && !backwards) {
      if (this.x > 700 && this.x <= 720) {
        this.velX = 0.2;
        this.phase = "snorkel-into-pool";
        this.playZombie("anim_jumpinpool", PLAY_ONCE_AND_HOLD, 20, 16);
      }
    } else if (this.phase === "snorkel-into-pool") {
      this.altitude = 10 * this.body.animTime; // TodAnimateCurve LINEAR 0->10 over the jump (1895)
      if (this.body.shouldTriggerTimedEvent(0.83)) {
        b.poolSplash(this.x - 47, this.y + 73, 1.2, 0.8);
        b.sfx("enteringWater"); // FOLEY_ZOMBIE_ENTERING_WATER (1902)
      }
      if (this.body.loopCount > 0) {
        this.phase = "poolwalk";
        this.inPool = true;
        this.playZombie("anim_swim", LOOP_FULL_LAST_FRAME, 0, 12);
      }
    } else if (this.phase === "poolwalk") {
      if (!this.hasHead) { this.takeDamage(1800, DMG_BYPASS | DMG_NOFLASH); return; } // headless snorkels drown (TakeDamage(1800, 9U), Zombie.cpp:598)
      if (this.x <= 25 && !backwards) {
        this.altitude = -90; this.x -= 15;
        this.phase = "snorkel-walk"; this.height = "out_of_pool";
        this.poolSplash(false);
        this.startWalkAnim(0);
      } else if (this.x > 640 && backwards) {
        this.altitude = -90; this.x += 15;
        this.phase = "snorkel-walk"; this.height = "out_of_pool";
        this.poolSplash(false);
        this.startWalkAnim(0);
      } else if (this.eating) {
        this.phase = "snorkel-up";
        this.playZombie("anim_uptoeat", PLAY_ONCE_AND_HOLD, 0, 24);
      }
    } else if (this.phase === "snorkel-up") {
      if (!this.eating) {
        this.phase = "snorkel-down";
        this.playZombie("anim_uptoeat", PLAY_ONCE_AND_HOLD, 0, -24);
      } else if (this.body.loopCount > 0) {
        this.phase = "snorkel-eat";
        this.playZombie("anim_eat", LOOP, 0, 0);
      }
    } else if (this.phase === "snorkel-eat") {
      if (!this.eating) {
        this.phase = "snorkel-down";
        this.playZombie("anim_uptoeat", PLAY_ONCE_AND_HOLD, 0, -24);
      }
    } else if (this.phase === "snorkel-down") {
      if (this.body.loopCount > 0) {
        this.phase = "poolwalk";
        this.playZombie("anim_swim", LOOP_FULL_LAST_FRAME, 0, 0);
        this.pickRandomSpeed();
      }
    }
  }
  // Zombie::UpdateZombieDolphinRider (Zombie.cpp:1758): land walk with the
  // dolphin, jump-in at the pool edge, riding, vault-jump over the first
  // plant (DOLPHIN_BEFORE_JUMPING + PLANT_WATER, velX 0.5, counter 120,
  // anim_dolphinjump@10), tall-nut bonk (BONK + TALL_NUT_BLOCK + FALLING),
  // re-entry splash mid-jump, then slow walking without the dolphin.
  // DOLPHIN_JUMP_TIME = 120 (Zombie.h:24).
  updateDolphin() {
    if (this.type !== "dolphin" || this.dead) return;
    if (this.isTangleKelpTarget()) return; // grabbed dolphins freeze (Zombie.cpp:414)
    const backwards = this.ally;
    const b = this.board;
    if (this.phase === "dolphin-walk" && !backwards) {
      if (this.x > 700 && this.x <= 720) {
        this.phase = "dolphin-into-pool";
        this.playZombie("anim_jumpinpool", PLAY_ONCE_AND_HOLD, 20, 16);
      }
    } else if (this.phase === "dolphin-into-pool") {
      if (this.body.shouldTriggerTimedEvent(0.56)) {
        b.poolSplash(this.x - 83, this.y + 73, 1.2, 0.8);
        b.sfx("enteringWater"); // FOLEY_ZOMBIE_ENTERING_WATER (1780)
      }
      if (this.body.loopCount > 0) {
        this.x -= 70;
        this.phase = "ride";
        this.inPool = true;
        this.playZombie("anim_ride", LOOP_FULL_LAST_FRAME, 0, 12);
      }
    } else if (this.phase === "ride") {
      if (this.x <= 10) {
        this.altitude = -40;
        this.height = "out_of_pool";
        this.phase = "dolphin-walk";
        this.poolSplash(false);
        this.playZombie("anim_walkdolphin", LOOP, 0, 0);
        this.pickRandomSpeed();
        return;
      }
      if (this.hasHead && !this.isTangleKelpTarget()) {
        const v = this.findVaultTarget();
        if (v) {
          b.sfx("dolphinBeforeJumping"); // FOLEY_DOLPHIN_BEFORE_JUMPING (1811)
          b.sfx("plantWater"); // FOLEY_PLANT_WATER (1812)
          this.velX = 0.5;
          this.phase = "dolphin-jump";
          this.phaseT = 120; // DOLPHIN_JUMP_TIME
          this.playZombie("anim_dolphinjump", PLAY_ONCE_AND_HOLD, 0, 10);
        }
      }
    } else if (this.phase === "dolphin-jump") {
      // Update (4234): the jump counter only ticks while mobile.
      if (this.phaseT > 0 && this.butter <= 0 && this.iceTrap <= 0) this.phaseT--;
      this.altitude = 10 * (1 - this.phaseT / 120); // TodAnimateCurve 0->10 LINEAR (1824)
      let jumpEnds = false;
      if (this.body.shouldTriggerTimedEvent(0.3)) {
        const v = this.findVaultTarget();
        if (v && v.seed === 23) {
          b.sfx("bonk"); // FOLEY_BONK (1832)
          jumpEnds = true;
          b.spawnTallnutBlock(v.x + 60, v.y - 20); // PARTICLE_TALL_NUT_BLOCK (1834)
          this.height = "falling";
          this.x = v.x + 25;
          this.altitude = 30;
        }
      } else if (this.body.shouldTriggerTimedEvent(0.49)) {
        b.poolSplash(this.x - 63, this.y + 73, 1.2, 0.8);
        b.sfx("enteringWater"); // FOLEY_ZOMBIE_ENTERING_WATER (1846)
        this.velX = 0;
      } else if (this.body.loopCount > 0) {
        jumpEnds = true;
        this.x -= 94;
        this.altitude = 0;
      }
      if (jumpEnds) {
        this.phase = "dolphin-poolwalk";
        this.startWalkAnim(0);
      }
    } else if (this.phase === "dolphin-poolwalk") {
      if ((this.x <= 10 && !backwards) || (this.x > 680 && backwards)) {
        this.altitude = -40;
        this.height = "out_of_pool";
        this.phase = "dolphin-walk-nodolphin";
        this.poolSplash(false);
        // UpdateZombieDolphinRider (1873): the dolphin-less exit plays plain
        // anim_walk (never StartWalkAnim — that would re-pick walkdolphin).
        this.playZombie("anim_walk", LOOP, 0, 0);
        this.pickRandomSpeed();
      }
    }
  }
  // Zombie::UpdateDamageStates (3785): arm below 2/3 body hp; head below 1/3
  // body hp EVEN WHILE ALIVE (no >0 guard on the head branch, unlike the
  // arm). The headless zombie is NOT dead: it keeps updating (walks, but no
  // longer starts eating — CheckIfPreyCaught 6780) and bleeds out via the
  // UpdatePlaying isDying tick (4555) until hp hits 0 and PlayDeathAnim runs.
  updateDamageStates() {
    if (!this.canLoseBodyParts()) return;
    // DOESNT_LEAVE_BODY hits (cherry/squash/doom, flag bit 4) hide the limb
    // but spawn no debris (DropHead 3415 / SetupReanimForLostArm 3702 skip it).
    if (this.hasArm && this.hp < (2 * this.maxHp) / 3 && this.hp > 0) this.dropArm(!(this.lastFlags & 16));
    if (this.hasHead && this.hp < this.maxHp / 3) {
      this.dropHead(!(this.lastFlags & 16));
      this.dropLoot(); // DropLoot (3798) — guarded, also fires at death
      try { this.board.noteZombieDefeated(this); } catch (e) { /* headless without board */ }
      this.stopDancerSound(); // StopZombieSound (3799)
      // Zombie::UpdateDamageStates (3799): StopZombieSound — a headed jack
      // that pops keeps shambling (the fuse gate needs the head, 1983), but
      // the crank never restarts.
      this.stopJackSong();
      this.stopDiggerSong(); // StopZombieSound (3799): head-pop stops the digger song too
      // HasLevelAwardDropped (3801): no award system in this sim (awards
      // resolve at level-complete), so the immediate-death branch is skipped.
      // Snorkel surfacing headless drowns on the spot (DieNoLoot, 3806).
      if (this.type === "snorkel" && this.phase === "poolwalk") { this.dead = true; this.gone = true; }
    }
  }
  // Zombie::DropArm (3758) + SetupReanimForLostArm (3585). Retail pops the
  // whole arm as PARTICLE_ZOMBIE_ARM (standalone IMAGE_ZOMBIE_ARM sprite,
  // positioned at the lower-arm track). Our atlases lack that sprite, so the
  // debris is a posed composite of the FULL arm (upper+lower+hand) rendered
  // by poseComposite. Which side pops is the OUTER/front arm for every type
  // (SetupReanimForLostArm hides Zombie_outerarm_lower+hand by default,
  // football_leftarm_lower+hand, paper hands + paper_leftarm_lower, pole
  // polevaulter_outerarm_lower + outerarm_hand) — verified per def with
  // intact-vs-hidden screenshot panels (an earlier inner/right mapping was
  // wrong: hiding outer/left removes the visible reaching arm, hiding
  // inner/right changes nothing). Only lower+hand hide; the upper stays as
  // the stump (retail swaps an UPPER2 bone image our atlases lack). The
  // other side stays fully intact. Door/paper shields block arm loss (3764).
  armCompositeTracks() {
    const t = this.type;
    if (t === "football") return ["Zombie_football_leftarm_upper", "Zombie_football_leftarm_lower", "Zombie_football_leftarm_hand"];
    if (t === "news") return ["Zombie_paper_leftarm_upper", "Zombie_paper_leftarm_lower", "zombie_paper_hands", "Zombie_paper_hands", "Zombie_paper_hands2"];
    if (t === "pole") return ["Zombie_polevaulter_outerarm_upper", "Zombie_polevaulter_outerarm_lower", "Zombie_outerarm_hand"];
    const names = this.body.def.tracks.map((tr) => tr.name);
    if (names.some((n) => n.toLowerCase() === "anim_innerarm1")) return ["Zombie_outerarm_upper", "Zombie_outerarm_lower"];
    const pick = (side, part) => names.find((n) => new RegExp(side, "i").test(n) && new RegExp(part, "i").test(n));
    const outer = [pick("outer", "upper"), pick("outer", "lower"), pick("outer", "hand")].filter(Boolean);
    if (outer.length) return outer;
    return ["Zombie_outerarm_upper", "Zombie_outerarm_lower", "Zombie_outerarm_hand"];
  }
  dropArm(spawn = true, chilled = this.chill > 0) {
    if (!this.hasArm) return;
    if (this.shield > 0 || this.paper > 0) return; // door / newspaper intact (3764)
    if (this.phase === "snorkel-into-pool" || this.phase === "dolphin-walk" || this.phase === "dolphin-into-pool" || this.phase === "ride" || this.phase === "dolphin-jump" || this.phase === "reading") return;
    this.hasArm = false;
    // SetupReanimForLostArm debris (3702-3754): a standalone arm sprite at
    // the lower-arm track — IMAGE_ZOMBIEJACKBOXARM for the jack (3739-3741),
    // positioned by GetTrackPosition("Zombie_jackbox_outerarm_lower") (3650).
    // Every other type rides the posed composite of the worn arm (the
    // generic-arm atlases ship no standalone sprite). The sprite is copied
    // to a fresh canvas (like headDebrisShot) so the chilled-tint bake below
    // can never corrupt the shared art.
    let shot = null;
    // Zombie::DropArm digger branch: standalone particles/ZombieDiggerArm.png
    // at the outerarm_lower track on a fresh chilled-tint-safe canvas.
    if (this.type === "digger") {
      try {
        const src = this.board.libs.images["particles/ZombieDiggerArm.png"];
        if (src && src.width) {
          const ti = this.body.findTrackIndex("Zombie_outerarm_lower");
          let sx = this.body.x, sy = this.body.y;
          if (ti >= 0) {
            const tr = this.body.getCurrentTransform(ti);
            if (isFinite(tr.x) && isFinite(tr.y)) { sx = this.body.x + tr.x; sy = this.body.y + tr.y; }
          }
          const cv = document.createElement("canvas");
          cv.width = src.width; cv.height = src.height;
          cv.getContext("2d").drawImage(src, 0, 0);
          shot = { img: cv, cx: cv.width / 2, cy: cv.height / 2, x: sx, y: sy };
        }
      } catch (e) { shot = null; }
    }
    if (!shot && this.type === "jack") {
      try {
        const src = this.board.libs.images["particles/ZombieJackboxArm.png"];
        if (src && src.width) {
          const ti = this.body.findTrackIndex("Zombie_jackbox_outerarm_lower");
          let sx = this.body.x, sy = this.body.y;
          if (ti >= 0) {
            const tr = this.body.getCurrentTransform(ti);
            if (isFinite(tr.x) && isFinite(tr.y)) { sx = this.body.x + tr.x; sy = this.body.y + tr.y; }
          }
          const cv = document.createElement("canvas");
          cv.width = src.width; cv.height = src.height;
          cv.getContext("2d").drawImage(src, 0, 0);
          shot = { img: cv, cx: cv.width / 2, cy: cv.height / 2, x: sx, y: sy };
        }
      } catch (e) { shot = null; }
    }
    if (!shot) shot = this.body.poseComposite(this.armCompositeTracks());
    const hide = (p) => this.body.assignRenderGroupToPrefix(p, RENDER_GROUP_HIDDEN);
    // SetupReanimForLostArm hide outline per type (upper stays as the stump).
    // SetupReanimForLostArm UPPER2 stump swaps (3616-3700): retail replaces
    // the upper-arm cel with a capped bone-stump image — the full upper cel
    // left in place ends in a hollow cut where the lower arm tore off. All
    // keys are art-gated by setImageOverrideByKey (missing track/key no-ops).
    const ovr = (tr, key) => this.body.setImageOverrideByKey(tr, key);
    const t = this.type;
    if (t === "football") { hide("Zombie_football_leftarm_lower"); hide("Zombie_football_leftarm_hand"); }
    else if (t === "news") {
      hide("Zombie_paper_hands"); hide("Zombie_paper_leftarm_lower");
      // SetupReanimForLostArm (3627): the upper arm swaps to the UPPER2 bone
      // stump (grafted into the paper atlas from the retail art).
      this.body.setImageOverrideByKey("Zombie_paper_leftarm_upper", "IMAGE_REANIM_ZOMBIE_PAPER_LEFTARM_UPPER2");
    }
    else if (t === "pole") { hide("Zombie_polevaulter_outerarm_lower"); hide("Zombie_outerarm_hand"); }
    else { hide("Zombie_outerarm_lower"); hide("Zombie_outerarm_hand"); }
    // UPPER2 stump swaps (3619-3698; backup has none, 3684-3686).
    if (t === "football") ovr("Zombie_football_leftarm_upper", "IMAGE_REANIM_ZOMBIE_FOOTBALL_LEFTARM_UPPER2");
    else if (t === "pole") ovr("Zombie_polevaulter_outerarm_upper", "IMAGE_REANIM_ZOMBIE_POLEVAULTER_OUTERARM_UPPER2");
    else if (t === "balloon") ovr("Zombie_outerarm_upper", "IMAGE_REANIM_ZOMBIE_BALLOON_OUTERARM_UPPER2");
    else if (t === "imp") ovr("Zombie_imp_outerarm_upper", "IMAGE_REANIM_ZOMBIE_IMP_ARM1_BONE");
    else if (t === "digger") ovr("Zombie_digger_outerarm_upper", "IMAGE_REANIM_ZOMBIE_DIGGER_OUTERARM_UPPER2");
    else if (t === "bobsled") ovr("Zombie_dolphinrider_outerarm_upper", "IMAGE_REANIM_ZOMBIE_BOBSLED_OUTERARM_UPPER2");
    else if (t === "jack") ovr("Zombie_jackbox_outerarm_lower", "IMAGE_REANIM_ZOMBIE_JACKBOX_OUTERARM_LOWER2");
    else if (t === "snorkel") ovr("Zombie_snorkle_outerarm_upper", "IMAGE_REANIM_ZOMBIE_SNORKLE_OUTERARM_UPPER2");
    else if (t === "dolphin") ovr("Zombie_dolphinrider_outerarm_upper", "IMAGE_REANIM_ZOMBIE_DOLPHINRIDER_OUTERARM_UPPER2");
    else if (t === "pogo") {
      ovr("Zombie_outerarm_upper", "IMAGE_REANIM_ZOMBIE_POGO_OUTERARM_UPPER2");
      ovr("Zombie_pogo_stickhands", "IMAGE_REANIM_ZOMBIE_POGO_STICKHANDS2");
      ovr("Zombie_pogo_stick", "IMAGE_REANIM_ZOMBIE_POGO_STICKDAMAGE2");
      ovr("Zombie_pogo_stick2", "IMAGE_REANIM_ZOMBIE_POGO_STICK2DAMAGE2");
    }
    else if (t === "flag") {
      // USER OVERRIDE: no tattered-flag swap on arm loss — the pole keeps
      // its intact cloth until the carrier dies (dropFlag handles death).
      ovr("Zombie_outerarm_upper", "IMAGE_REANIM_ZOMBIE_OUTERARM_UPPER2");
    }
    else if (t === "dancer") ovr("Zombie_Jackson_outerarm_upper", "IMAGE_REANIM_ZOMBIE_JACKSON_OUTERARM_UPPER2");
    else if (t === "ladder") ovr("Zombie_ladder_outerarm_upper", "IMAGE_REANIM_ZOMBIE_LADDER_OUTERARM_UPPER2");
    else if (t === "yeti") ovr("Zombie_yeti_outerarm_upper", "IMAGE_REANIM_ZOMBIE_YETI_OUTERARM_UPPER2");
    else if (t !== "news" && t !== "backup") ovr("Zombie_outerarm_upper", "IMAGE_REANIM_ZOMBIE_OUTERARM_UPPER2");
    // Zombie::DropArm (3758): the limb pop plays unconditionally (no
    // damage-flag gate in source) — even for instakill hides.
    this.board.sfx("limbsPop");
    // Chilled tint (user override): an arm torn off a chilled zombie falls as
    // blue debris (same tint as the chilled body). Baked into the composite
    // here so later chill wear-off can't change it.
    if (chilled && spawn && shot) tintShotChilled(shot);
    // SetupReanimForLostArm debris gate (!mInPool): no arm mote while wading.
    if (spawn && shot && !this.inPool) this.board.debris.push(new Debris(this.board, "arm", shot.x, shot.y, this.row, shot));
  }
  // Zombie::DropLoot (7211-7226): fires at head-pop (3798, while the zombie
  // is still shambling) and again at death (7916). TrySpawnLevelAward runs
  // FIRST, ungated (7222) — the end-of-level award drops on early levels
  // too (it's how 1-9 hand out seeds/shovel/note). Regular loot is then
  // skipped when the award spawned, when the board already dropped the
  // award, or when !CanDropLoot (7223) — no regular coins on first-time
  // adventure below level 11 (CanDropLoot 9571).
  dropLoot() {
    if (!this.droppedLoot) this.board.trySpawnLevelAward(this);
    if (this.droppedLoot || this.board.levelAwardSpawned || !this.board.canDropLoot()) return;
    this.droppedLoot = true;
    // DropLoot (Zombie.cpp:7228-7231): Little Trouble keeps only 1 in 4
    // coin rolls (Rand(4) == 0). Set after mDroppedLoot, so head-pop loot
    // never retries — same as source.
    if (this.board.level === 25 && Math.floor(Math.random() * 4) !== 0) return;
    this.board.dropZombieLoot(this);
  }
  // Zombie::DropHead (3402) + SetupReanimForLostHead (3394). Retail pops the
  // whole head as PARTICLE_ZOMBIE_HEAD (standalone sprite + per-type
  // OverrideImage). Ours is a posed composite of the full head: anim_head1
  // (skull) + anim_head2 (jaw) — capturing head1 alone yields half a head.
  // Face parts live on separate tracks for some types (paper eyes/glasses,
  // snorkel jaw+mask, digger eyes, jack clownhead), so each type captures
  // its complete worn face — the debris is the killed zombie's own head.
  // Non-matching/hidden/frame<0 tracks are skipped by poseComposite, so
  // extra names are safe. Hair/tongue stay hidden per source (the debris is
  // bald, like retail's). Pops below 1/3 body hp while alive
  // (UpdateDamageStates 3795) as well as on death (TakeBodyDamage 7912) and
  // mower kills. The limb pop plays whenever the head actually pops
  // (DropHead 3582 — the DOESNT_LEAVE_BODY early return at 3415 skips it).
  headCompositeTracks() {
    const base = ["anim_head1", "anim_head2", "anim_head"];
    const t = this.type;
    if (t === "news") return [...base, "anim_head_jaw", "anim_head_look", "anim_head_pupils", "anim_head_glasses"];
    if (t === "snorkel") return [...base, "anim_head_jaw", "anim_head_snorkle"];
    if (t === "digger") return [...base, "Zombie_digger_head_eye"];
    if (t === "jack") return ["Zombie_jackbox_clownhead", ...base]; // hidden until the jack pops (frame<0: auto-skipped), harmless to list
    if (t === "bungee") return [...base, "Zombie_bungi_jaw"];
    if (t === "garg") return ["Zombie_gargantua_jaw", "anim_head1"];
    if (t === "catapult") return ["Zombie_catapult_driver_head", "Zombie_catapult_driver_mouth"];
    if (t === "zamboni") return ["Zombie_head", "Zombie_jaw"];
    return base;
  }
  // Retail per-type head debris (DropHead 3479-3523): these zombies drop
  // their OWN head sprite (IMAGE_ZOMBIE*HEAD / ZPAPERHead particles), not the
  // generic head. Everyone else (normal/flag/cone/bucket/door/ducky/bungee/
  // jack/catapult/zamboni/...) drops the generic head = the worn anim_head
  // tracks, which headCompositeTracks captures. Sprites are vendored
  // byte-identical from the user files (src/assets/images/particles/); the
  // snorkel head comes straight from its def atlas. Returns a fresh-canvas
  // {img,cx,cy} (safe for the chilled-tint bake) or null when the art isn't
  // loaded — callers fall back to the posed composite.
  // SCALE (Zombie.cpp DropHead + ZombieHead.xml): every head particle plays
  // at ParticleScale .8 (ZombieHead.xml AND ZombiePogoHead.xml both say .8),
  // so sprite shots carry s: 0.8. The posed-composite path is body-true art
  // instead (user override: don't shrink it), so dropHead stamps those 1.0.
  headDebrisShot() {
    const ART = {
      news: "particles/ZPAPERHead.png", pogo: "particles/ZombiePogoHead.png",
      balloon: "particles/ZombieBalloonHead.png", dancer: "particles/ZombieDancerHead.png",
      backup: "particles/ZombieBackupDancerHead.png", bobsled: "particles/ZombieBobsledHead.png",
      ladder: "particles/ZombieLadderHead.png", imp: "particles/ZombieImpHead.png",
      football: "particles/ZombieFootballHead.png", pole: "particles/ZombiePoleVaulterHead.png",
      digger: "particles/ZombieDiggerHead.png", dolphin: "particles/ZombieDolphinRiderHead.png",
      yeti: "particles/ZombieYetiHead.png",
    }[this.type];
    let cv = null;
    if (ART) {
      try {
        const src = this.board.libs.images[ART];
        if (src && src.width) {
          cv = document.createElement("canvas");
          cv.width = src.width; cv.height = src.height;
          cv.getContext("2d").drawImage(src, 0, 0);
        }
      } catch (e) { cv = null; }
    } else if (this.type === "snorkel") {
      // Retail override is the def's HEAD cel (IMAGE_REANIM_ZOMBIE_SNORKLE_HEAD).
      try {
        const def = this.board.libs.getReanim("Zombie_snorkle");
        const r = def.images.get("IMAGE_REANIM_ZOMBIE_SNORKLE_HEAD");
        if (r) {
          cv = document.createElement("canvas");
          cv.width = r.w; cv.height = r.h;
          cv.getContext("2d").drawImage(def.atlas, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
        }
      } catch (e) { cv = null; }
    }
    if (!cv) return null;
    // ParticleScale .8 (ZombieHead.xml / ZombiePogoHead.xml) — the standalone
    // sprite is authored larger than the worn head and shrinks on detachment —
    // times the carrier's scale on Little Trouble (0.5).
    const s = (this.scaleZombie || 1);
    return { img: cv, cx: cv.width / 2, cy: cv.height / 2, s: 0.8 * s };
  }
  dropHead(spawn = true, chilled = this.chill > 0) {
    if (!this.hasHead || !this.canLoseBodyParts()) return;
    this.hasHead = false;
    // Own-head sprite when this type has one, else the posed composite of
    // the worn head tracks (headCompositeTracks). Spawn point is the head
    // track (retail GetTrackPosition anim_head1), falling back to the
    // composite center when the track is missing.
    let shot = this.headDebrisShot();
    if (shot) {
      let placed = false;
      try {
        const ti = this.body.findTrackIndex("anim_head1");
        // Scaled carriers draw the head track scaled (syncBody anchor shift),
        // so the debris spawns from the scaled track position (== at s=1).
        const s = this.scaleZombie || 1;
        if (ti >= 0) {
          const tr = this.body.getCurrentTransform(ti);
          if (isFinite(tr.x) && isFinite(tr.y)) { shot.x = this.body.x + tr.x * s; shot.y = this.body.y + tr.y * s; placed = true; }
        }
      } catch (e) { /* composite-center fallback below */ }
      if (!placed) {
        const c = this.body.poseComposite(this.headCompositeTracks());
        if (c) { shot.x = c.x; shot.y = c.y; } else shot = null;
      }
    } else shot = this.body.poseComposite(this.headCompositeTracks());
    // Composite heads are rasterized from the worn tracks at body-true size,
    // so they ride at 1.0 (user override — don't shrink them); sprite shots
    // already carry retail's 0.8 from headDebrisShot above.
    if (shot && shot.s === undefined) shot.s = 1.0;
    const hide = (p) => this.body.assignRenderGroupToPrefix(p, RENDER_GROUP_HIDDEN);
    hide("anim_head"); hide("anim_hair"); hide("anim_tongue");
    if (this.type === "pole") { // Zombie::DropHead 3465 -> DropPole 3375-3377
      hide("Zombie_polevaulter_innerarm"); hide("Zombie_polevaulter_innerhand"); hide("Zombie_polevaulter_pole");
    }
    if (this.type === "pogo") this.pogoBreak(this.lastFlags); // DropHead 3449: decapitation breaks the stick (flags ride through to the shatter particle)
    if (this.butter > 0) { this.butter = 0; this.updateAnimSpeed(); } // DropHead 3407
    if (spawn) this.dropFlag(); // flag carrier drops the pole with the head (DropHead 3469)
    if (spawn) this.board.sfx("limbsPop");
    // Chilled tint (user override): like the arm above — the head keeps the
    // zombie's chilled blue. The flag pole is carried gear, not body: it and
    // all helm/shield debris are never tinted.
    if (chilled && spawn && shot) tintShotChilled(shot);
    // DropHead 3437-3458: mInPool picks PARTICLE_ZOMBIE_HEAD_POOL (short
    // sinker, no bounce) — except newspaper, which overrides back to its own
    // head particle (normal land physics) even in the pool.
    const kind = (this.inPool && this.type !== "news") ? "headPool" : "head";
    if (spawn && shot) this.board.debris.push(new Debris(this.board, kind, shot.x, shot.y, this.row, shot));
  }
  // Zombie::DropFlag (Zombie.cpp:3351): the carrier's pole detaches (head-pop
  // while alive, death-fall start, mower kill) — the hanging inner arm comes
  // back, the grip hand + carrying arm hide, and the flag tumbles off as
  // debris at the flaghand track + (6,-45).
  // USER OVERRIDE (no retail art): the debris is the carrier's own posed
  // pole — shaft + intact cloth rasterized before detach — never the retail
  // FLAG3 sprite. Instakills skip it via the spawn gate (DropHead 3415).
  dropFlag() {
    if (this.type !== "flag" || !this.flagPole) return;
    // Scaled carriers (Little Trouble 0.5) drop a scaled pole from a scaled
    // anchor: the flaghand track rides in unscaled track units while the body
    // draws them scaled, and the debris shot is rasterized from the
    // full-size pole reanim (unlike body composites, which bake body scale).
    const s = this.scaleZombie || 1;
    let fx = this.x + 6, fy = this.y - 45;
    try {
      const t = this.body.getCurrentTransform(this.body.findTrackIndex("Zombie_flaghand"));
      if (isFinite(t.x) && isFinite(t.y)) { fx = this.body.x + t.x * s + 6; fy = this.body.y + t.y * s - 45; }
    } catch (e) { /* board-space fallback above */ }
    let shot = null;
    try { shot = this.flagPole.poseComposite(["Zombie_flagpole", "Zombie_flag"]); } catch (e) { shot = null; }
    this.flagPole.dead = true; this.flagPole = null;
    this.body.assignRenderGroupToPrefix("anim_innerarm", RENDER_GROUP_NORMAL);
    this.body.assignRenderGroupToTrack("Zombie_flaghand", RENDER_GROUP_HIDDEN);
    this.body.assignRenderGroupToTrack("Zombie_innerarm_screendoor", RENDER_GROUP_HIDDEN);
    if (shot) {
      shot.x = fx; shot.y = fy;
      // Flag debris rides LIMB_DEBRIS 0.8 like other gear — times the
      // carrier's scale (1.0 everywhere but Little Trouble).
      shot.s = 0.8 * s;
      this.board.debris.push(new Debris(this.board, "flag", shot.x, shot.y, this.row, shot));
    }
  }
  // TodFoley set-pick for the UpdatePlaying groan (Zombie.cpp:4478-4506):
  // FOLEY_GROAN = groan1-6 uniform; the variant-zombie FOLEY_BRAINS set adds
  // sukhbir4-6, which have no assets in our set — groans only. Garg rumbles
  // FOLEY_LOW_GROAN (lowgroan1-2). Every non-garg path rolls PlayFoleyPitch
  // with aPitch: 0 normally, RandRangeFloat(40, 50) on Little Trouble
  // (4483-4486), passed as the explicit pitch (2^(steps/12)).
  playGroan() {
    if (this.type === "garg") this.board.sfx(Math.random() < 0.5 ? "lowgroan" : "lowgroan2");
    else {
      const pitch = this.board.level === 25 ? 40 + Math.random() * 10 : 0;
      const n = 1 + Math.floor(Math.random() * 6); this.board.sfx(n === 1 ? "groan" : "groan" + n, 1, pitch);
    }
  }
  // Zombie::PlayDeathAnim (Zombie.cpp:8874): per-type fall rate, then the
  // mZombieFade countdown (UpdateDeath 9259: 100 on land, 10 in pool) with
  // the alpha ramp over its last 10 ticks and removal at 0 (render-side).
  die(silent = false) {
    if (this.dead) return;
    if (this.type === "bungee") this.bungeeDie(); // BungeeDie on every death — drop the plant + cargo
    // PlayDeathAnim DieNoLoot gates (8885-8894): dolphins dying anywhere but
    // dolphin-poolwalk, and snorkels caught in into-pool/walk, vanish lootless
    // with no fall — no debris, no loot, award try only.
    if ((this.type === "dolphin" && this.phase !== "dolphin-poolwalk") ||
        (this.type === "snorkel" && (this.phase === "snorkel-into-pool" || this.phase === "snorkel-walk"))) {
      if (this.tangleFx) { this.tangleFx.dead = true; this.tangleFx = null; }
      this.stopDancerSound(); // StopZombieSound via DieNoLoot (7361)
      this.stopJackSong(); this.stopDiggerSong(); this.board.detachDiggerTunnel(this); // Zombie::DieNoLoot (7361)
      try { this.board.noteZombieDefeated(this); } catch (e) { /* headless without board */ }
      this.board.trySpawnLevelAward(this);
      this.dead = true; this.gone = true;
      return;
    }
    this.dead = true; this.fadeT = -1; this.playedFall = false;
    this.butter = 0;
    // Zombie::PlayDeathAnim (8895-8899): a frozen victim bursts its thaw
    // shards (PARTICLE_ICE_TRAP_RELEASE at +75/+106) and the trap clears
    // silently (direct zero — RemoveIceTrap's thaw song only runs on a live
    // thaw, 8336-8346).
    if (this.iceTrap > 0) { this.board.spawnIceRelease(this.x + 75, this.y + 106); this.iceTrap = 0; }
    this.stopDancerSound(); // StopZombieSound via DieNoLoot (7361)
    this.stopJackSong(); this.stopDiggerSong(); this.board.detachDiggerTunnel(this); // Zombie::DieNoLoot (7361): every death stops the loop
    // AlmanacPlayerDefeatedZombie (DropLoot 7211, via DieNoLoot/DieWithLoot):
    // every on-board death marks the type defeated, even lootless/gulped ones.
    try { this.board.noteZombieDefeated(this); } catch (e) { /* headless without board */ }
    // Death clears chill before the head pops below — snapshot it so the
    // death debris keeps the chilled blue (user override).
    const wasChilled = this.chill > 0;
    this.chill = 0;
    this.yucky = 0; // PlayDeathAnim (8905): yucky clears on the fall
   if (this.surprise) this.surprise.dead = true; // AttachmentReanimTypeDie(SURPRISE) (8926)
   if (this.tangleFx) { this.tangleFx.dead = true; this.tangleFx = null; } // attached TANGLEKELP vines retire with the victim
    // RiseFromGrave pool (8167-8196): the 3 attached PARTICLE_ZOMBIE_SEAWEED
    // systems die with the zombie (AttachmentDie) — they loop indefinitely,
    // so a mid-rise kill must drop them explicitly.
    if (this.seaweeds) { for (const sw of this.seaweeds) { try { sw.reanim.detach(); } catch (e) { /* ignore */ } sw.reanim.dead = true; } this.seaweeds = null; }
   this.stopEating();
    // PlayDeathAnim (8929): a held shield drops FIRST (flags 1U = BYPASS —
    // the shield/debris falls off but no RIP/"?" fires). Without this the
    // corpse kept its paper/door/ladder through the whole death fall.
    if (this.paper > 0 || this.shield > 0 || this.ladder > 0) this.dropShield(1);
    this.velX = 0; // PlayDeathAnim (8939)
    if (this.type === "pogo") this.altitude = 0; // PlayDeathAnim (8921-8924)
    this.phase = "dying"; // PHASE_ZOMBIE_DYING (8940; feeds the dolphin getDrawPos branch)
    // Zombie::DieNoLoot (7368): every death path tries the level award, even
    // silent/gulp kills that drop no regular loot (and even types with no
    // death fall below).
    this.board.trySpawnLevelAward(this);
    if (this.type === "bobsled") this.bobsledDie(); // BobsledDie (7368 tail): linked members die with it
    // Heads pop on death (never while alive). Instakills (cherry/squash/doom/
    // jalapeno: DOESNT_LEAVE_BODY bit 4) and gulps leave no debris — but the
    // limbs still come off visually (UpdateDamageStates/DieNoLoot hide them).
    const leavesBody = !silent && !(this.lastFlags & 16);
    this.dropHead(leavesBody, wasChilled);
    if (!leavesBody) this.dropArm(false);
    const t = this.type;
    let rate;
    if (t === "football") rate = 24;
    else if (t === "garg" || t === "snorkel" || t === "yeti") rate = 14;
    else if (t === "digger" || t === "boss") rate = 18;
    else rate = 24 + Math.random() * 6;
    // PlayDeathAnim (8989-8992): pool deaths play the water track when the
    // def has it. The per-track clip bypass does NOT ride along: retail
    // re-clips the tube (ReanimIgnoreClipRect("Zombie_duckytube", false))
    // so it sinks with the body instead of floating at the waterline.
    // Whitewater/hands stay unclipped, exactly like source.
    let deathTrack = "anim_death";
    if (this.inPool && this.body.trackExists("anim_waterdeath")) {
      deathTrack = "anim_waterdeath";
      this.body.setIgnoreClipRect("Zombie_duckytube", false);
    }
    if (!this.body.trackExists(deathTrack)) { this.gone = true; return; }
    this.playZombie(deathTrack, PLAY_ONCE_AND_HOLD, 20, rate);
    // TakeBodyDamage (7916): the fall plays, then loot drops (guarded — may
    // already have dropped at head-pop).
    if (silent) return;
    this.dropLoot();
    // No death groan in source: neither TakeBodyDamage nor PlayDeathAnim
    // plays any GROAN-family foley (the fall thud is FOLEY_ZOMBIE_FALLING).
  }
  // Zombie::DieNoLoot + DieWithLoot (Zombie.cpp:7359/7255): every burn death
  // funnels here — TrySpawnLevelAward, loot (guarded: may already have
  // dropped at head-pop), body reanim removed (DieNoLoot 7363 removes the
  // body/mower/head reanims) so NOTHING of the zombie renders afterward —
  // never the anim_death fall. Unlike die() there are no limb pops, no fall
  // anim, no thud, no fade: the charred husk (spawned by applyBurn before
  // this) or the black freeze IS the whole visual.
  dieWithLoot() {
    if (this.dead) return;
    if (this.type === "bungee") this.bungeeDie(); // BungeeDie on every death — drop the plant + cargo
    this.stopDancerSound(); // StopZombieSound via DieNoLoot (7361)
    this.stopJackSong(); this.stopDiggerSong(); // Zombie::DieNoLoot (7361): every death stops the loop
    this.board.trySpawnLevelAward(this);
    // Attached seaweed dies with the zombie on every death path
    // (AttachmentDie) — see die() for the pool-rise comment.
    if (this.seaweeds) { for (const sw of this.seaweeds) { try { sw.reanim.detach(); } catch (e) { /* ignore */ } sw.reanim.dead = true; } this.seaweeds = null; }
    if (this.type === "bobsled") this.bobsledDie(); // BobsledDie (DieWithLoot -> DieNoLoot): linked members die with it
    this.dropLoot();
    this.dead = true; this.gone = true;
  }
  // Zombie::ApplyBurn (Zombie.cpp:8633): cherry/doom fire deaths. The key
  // retail rule the old code missed: burning almost NEVER plays anim_death —
  // headed walkers are replaced on the spot by a black REANIM_ZOMBIE_CHARRED
  // husk playing anim_crumble (then DieWithLoot removes the body), while
  // headless/flying/etc. zombies freeze BLACK (burned render phase, 300
  // ticks) and only then die. Only zombies still standing at >= 1800 body hp
  // (gargs in scope) take plain 1800 damage with flags 18U instead.
  applyBurn() {
    if (this.dead || this.gone || this.mowed || this.burnT > 0) return; // 8635
    if (this.hp >= 1800 || this.type === "boss") { // 8638 (mBodyHealth, pre-armor)
      this.takeDamage(1800, DMG_HITS_BOTH | DMG_NOLEAVE);
      return;
    }
    // No squash-heads in the 1-9 roster (8644 special-head skip, noted).
    if (this.iceTrap > 0) this.removeIceTrap(); // RemoveIceTrap (8650, no thaw burst)
    this.chill = 0; // cold effects cleared...
    this.butter = 0; // ...and butter (8655).
    // AttachmentDetachCrossFadeSmoke + BungeeDropPlant (8659-8660): no
    // attachment smoke is modeled — but the bungee plant-grab release is.
    if (this.type === "bungee") this.bungeeDropPlant();
    this.updateAnimSpeed(); // chill/butter cleared above re-rates the anim
    const t = this.type;
    // Die-outright phases (8662-8679): dying, polevault mid-vault, thrown
    // imps, grave/dance risers, every dolphin/snorkel pool-transition
    // phase, digger tunneling, the mowed — and anything physically in the
    // pool (mInPool). The old gate used `swimming` as the pool proxy, but
    // plain ducky-tube waders have swimming=false with inPool=true, so
    // cherry-bombing them wrongly played the black charred freeze/husk.
    const dieOutright = this.inPool || this.swimming || this.phase === "tunnel" || this.phase === "digrise" || this.phase === "digpause" || this.phase === "digrisenoaxe" || this.vaultT > 0 ||
      this.phase === "dying" || this.phase === "zdying" || this.phase === "invault" ||
      this.phase === "rising" || this.phase === "dancerise" ||
      this.phase === "snorkel-into-pool" || this.phase === "dolphin-into-pool" ||
      this.phase === "dolphin-jump" || this.phase === "ride";
    if (dieOutright) { this.dieWithLoot(); return; }
    // Black-freeze phases (8680): bungee/yeti/zombotany/sled-teams/fliers
    // and the headless. Bungee/yeti/zombotany never reach this port (out of
    // the 1-9 scope) but ride the same branch; balloon fliers and headless
    // walkers do occur, and bobsled teams freeze member-by-member (the
    // KillAllZombiesInRadius loop ApplyBurns each zombie individually).
    if (t === "bungee" || t === "yeti" || t === "bobsled" || this.flying || !this.hasHead) {
      this.burnT = 300; // mPhaseCounter = 300 (8690) — set BEFORE the anim call so updateAnimSpeed's burned guard freezes the rate
      this.playZombie("anim_idle", PLAY_ONCE_AND_HOLD, 20, 0); // SetAnimRate(0) 8682: frozen mid-frame
      this.justShot = 0; // mJustGotShotCounter = 0 (8691)
      this.dropLoot(); // DropLoot (8692), guarded
      if (t === "bobsled") this.bobsledBurn(); // BobsledBurn (ApplyBurn tail): leader burns, followers die lootless
      // BalloonPropellerHatSpin(false) (8694): the hat spin is not modeled.
      return;
    }
    // Charred husk (8700+): the body is replaced by a black crumbling corpse
    // at (mPosX+22, mPosY-10), rate x Rand(0.9, 1.1), then DieWithLoot.
    // Variant husks (imp/digger/zamboni/catapult/garg) and their offsets are
    // ported below but only base Zombie_Charred art ships (the variants never
    // occur in the 1-9 scope), so missing art falls back to the base husk.
    let husk = "Zombie_Charred", hx = this.x + 22, hy = this.y - 10;
    if (t === "balloon") hy += 31;
    else if (t === "imp") { hx -= 6; husk = "Zombie_Charred_Imp"; }
    else if (t === "digger") { if (this.isDiggerBackwards()) hx += 14; husk = "Zombie_Charred_Digger"; }
    else if (t === "zamboni") { hx += 61; hy -= 16; husk = "Zombie_Charred_Zamboni"; }
    else if (t === "catapult") { hx -= 36; hy -= 20; husk = "Zombie_Charred_Catapult"; }
    else if (t === "garg") { hx -= 15; hy -= 10; husk = "Zombie_Charred_Gargantuar"; }
    try {
      const body = this.board.makeReanim(husk, hx, hy);
      // Charred digger without its axe crumbles via anim_crumble_noaxe (retail husk variant).
      if (t === "digger" && !this.hasObject && body.trackExists("anim_crumble_noaxe")) body.playReanim("anim_crumble_noaxe", PLAY_ONCE, 0, (body.def.fps || 12) * (0.9 + Math.random() * 0.2));
      else body.playReanim("anim_crumble", PLAY_ONCE, 0, (body.def.fps || 12) * (0.9 + Math.random() * 0.2)); // def fps x RandRangeFloat(0.9, 1.1) (8741)
      if (this.scaleZombie && this.scaleZombie !== 1) {
        body.setScale(this.scaleZombie, this.scaleZombie); // OverrideScale (8758)
        body.overlay.e += 20 - this.scaleZombie * 20; // mOverlayMatrix.m02 (8760)
        body.overlay.f += 120 - this.scaleZombie * 120; // mOverlayMatrix.m12 (8761)
      }
      if (this.isDiggerBackwards()) { // IsWalkingBackwards: mirror + shift (8765-8768)
        body.setScale(-(this.scaleZombie || 1), this.scaleZombie || 1);
        body.overlay.e += 60 * (this.scaleZombie || 1);
      }
      this.board.husks.push({ body, row: this.row });
    } catch (e) { /* art failed: the DieWithLoot below still retires the body */ }
    this.dieWithLoot();
  }
  // Zombie::MowDown (Zombie.cpp:8525). Mower kills never play anim_death.
  // Eligible zombies flip via a REANIM_LAWN_MOWERED_ZOMBIE driver reanim
  // (mAnimRate 8, PLAY_ONCE_AND_HOLD, 8608-8613) whose track-0 matrix is
  // applied to the body overlay each tick (Update 5273-5289); when it loops,
  // head+arm pop and the zombie is removed instantly with loot already
  // dropped (UpdateMowered 9266 / DieWithLoot 7255). Vehicles explode
  // instead; the ineligible (garg/bungee/digger/imp/yeti/dolphin/flying/
  // in-pool/vaulting...) puff out with drops + loot, no flip.
  mowDown() {
    if (this.dead || this.mowed || this.type === "boss") return; // 8527 (+boss, LawnMower 189)
    const t = this.type;
    if (t === "catapult" || t === "zamboni") { // 8530-8544: explosion + DieWithLoot
      // ZamboniDeath equivalence (ZamboniDeath 6424 non-spike branch): the
      // explosion burst at (+80,+60) + DieWithLoot (award try + loot). The
      // flashAt screen flash is dropped — the port's own zamboniDeath uses
      // the particle burst alone, and source has no flash here either.
      // (Catapult keeps the flashAt stand-in: its CATAPULT_EXPLOSION art is
      // not vendored — noted below.)
      if (t === "zamboni") this.board.spawnZamExplosion(this.x + 80, this.y + 60, false);
      else this.board.flashAt(this.x + 80, this.y + 60, 110);
      this.board.sfx("boom");
      this.board.trySpawnLevelAward(this); // DieWithLoot (7255 -> 7363): award try rides along
      this.dropLoot();
      this.dead = true; this.gone = true;
      return;
    }
    // 8546-8577: too big / airborne / mid-special-anim / sled-team — puff +
    // drops + loot. Sled teams never flip (IsBobsledTeamWithSled): the whole
    // team pops out lootless-ish with drops + loot, then dies via DieWithLoot
    // (which cascades to the linked members below).
    // (Unreachable in L1-9: no garg/digger/etc, no pool, no bungee targets.)
    // NOTE: retail mowed deaths pop PARTICLE_MOWERED_ZOMBIE_HEAD (8525+) — no
    // such art ships in the user files, so dropHead's normal per-type art is
    // used instead. Deliberate, noted.
    if (this.phase === "invault" || t === "garg" || t === "bungee" || t === "digger" ||
        t === "imp" || t === "yeti" || t === "dolphin" || (t === "bobsled" && this.bobsledPosition() !== -1) || this.flying || this.inPool) {
      this.stopDiggerSong(); this.board.detachDiggerTunnel(this);
      // REANIM_PUFF at (mPosX-73, mPosY-56), renderOrder+2 (8563-8564):
      // AddReanimation + SetFramesForLayer("anim_puff") only — the retail
      // ctor defaults hold (PLAY_ONCE, def fps; Reanimator.cpp:291/381), so
      // the burst plays its cropped span once and dies. Ticked + swept in
      // updateFx, drawn in the row pass above the row's debris (source
      // renderOrder+2 vs debris +1) — same holder pattern as the husks.
      try {
        const puff = this.board.makeReanim("Puff", this.x - 73, this.y - 56);
        puff.loopType = PLAY_ONCE; // retail ctor default (the port defaults to LOOP)
        puff.setFramesForLayer("anim_puff");
        this.board.puffs.push({ body: puff, row: this.row });
      } catch (e) { /* def missing: the mower cloud below still shows */ }
      // PARTICLE_MOWER_CLOUD at (mPosX+110, mPosY) (8565): the 2-emitter
      // MowerCloud.xml burst (small + big grey-green ExplosionCloud puffs)
      // through the zam engine, TOP pass like every other zam system.
      this.board.spawnMowerCloud(this.x + 110, this.y);
      if (!this.board.isWaterRow(this.row)) {
        this.dropHead(true); this.dropArm(true); this.dropHelm(0); this.dropShield(0);
      }
      this.dropLoot();
      this.board.trySpawnLevelAward(this); // DieWithLoot (8614 -> 7255 -> 7363): the award try rides along
      if (t === "bobsled") this.bobsledDie(); // linked members die with the leader
      if (t === "bungee") this.bungeeDie(); // BungeeDie (DieNoLoot tail 7373): drop the plant + cargo
      this.dead = true; this.gone = true;
      return;
    }
    // 8579-8601: cold effects cleared (RemoveIceTrap, silent — no thaw burst
    // or song on the mower path), armor + type extras shed.
    if (this.iceTrap > 0) this.removeIceTrap();
    this.chill = 0; this.butter = 0;
    this.stopDancerSound(); // StopZombieSound via DieWithLoot (MowDown -> 8614 -> 7255)
    this.dropShield(0); this.dropHelm(0);
    if (t === "flag") this.dropFlag(); // MowDown 8590 (pole tumbles off, arm restores)
    else if (t === "pole") this.body.assignRenderGroupToPrefix("Zombie_polevaulter_pole", RENDER_GROUP_HIDDEN);
    else if (t === "news" || t === "balloon") this.dropHead(true);
    else if (t === "pogo") { this.dropHead(true); this.altitude = 0; }
    try {
      this.mowDriver = this.board.makeReanim("LawnMowedZombie", 0, 0); // AddReanimation(0,0)
      this.mowDriver.playReanim("locator", PLAY_ONCE_AND_HOLD, 0, 8);
    } catch (e) { this.mowDriver = null; }
    this.mowed = true;
    // MowZombie lawn branch (LawnMower.cpp:154): the flattening splat, played
    // softer (0.5) than pea-impact splats per user request. Retail PlayFoley
    // has no per-call volume (TodFoley.cpp plays every foley full), so source
    // plays this full — the softening is a deliberate user mix override.
    this.board.sfx("splat", 0.5);
    this.dropLoot(); // MowDown (8614)
  }
  update() {
    const r = ROSTER[this.type];
    // Zombie::UpdateZombie (4265-4269): the shot-flash counters tick down
    // EVERY tick, including while dying — so a killing blow's flash fades
    // in 25 ticks instead of glowing through the whole death fall.
    if (this.justShot > 0) this.justShot--;
    if (this.shieldShot > 0) this.shieldShot--;
    // Zombie::TakeShieldDamage (7555): shield hits knock the shield back
    // (mShieldRecoilCounter = 12, drawn as a 3->0px X shift on the shield
    // pass) unless the hit neither flashes nor shakes (!NOFLASH && !HITSBOTH).
    if (this.shieldRecoil > 0) this.shieldRecoil--;
    // Zombie::Update (4219): the burned phase replaces the whole update —
    // the zombie stands frozen (rate 0, set at burn time) while mPhaseCounter
    // ticks down, then DieWithLoot (UpdateBurn 4188-4194). No walking, eating,
    // groaning, or aging meanwhile.
    if (this.burnT > 0) {
      this.body.update(); // frozen mid-frame (animRate 0 via updateAnimSpeed)
      this.syncBody();
      if (--this.burnT <= 0) this.dieWithLoot();
      return;
    }
    // Dying: fall anim plays (rate set by die()), then the body lies while
    // mZombieFade runs 100->0 (UpdateDeath 9259 / Update 4274-4281; 10 in
    // pool, never for the boss) and is removed at 0. The fade alpha
    // (255*fade/10, Draw 5581) is render-side, from z.fadeT. Position stays
    // synced.
    if (this.dead) {
      this.body.update();
      this.syncBody();
      // Zombie::UpdateDeath (9048-9181): the body-thud foley fires once at
      // the per-type fallTime timed event of the death fall
      // (FOLEY_ZOMBIE_FALLING = the two zombie_falling variants, picked
      // randomly like every foley set). Mowed zombies never run UpdateDeath
      // (UpdateMowered removes them instead), so no thud there; and the whole
      // thud block sits inside if (!mInPool) (9073) — pool deaths are silent.
      if (!this.mowed && !this.inPool && !this.playedFall) {
        const ft = zombieFallTime(this);
        if (ft > 0 && this.body.trackExists("anim_death") && this.body.shouldTriggerTimedEvent(ft)) {
          this.playedFall = true;
          this.board.sfx(Math.random() < 0.5 ? "zombieFalling" : "zombieFalling2");
        }
      }
      if (this.body.loopCount > 0) {
        // UpdateDeath (9261): mZombieFade = mInPool ? 10 : 100.
        if (this.fadeT < 0) this.fadeT = this.inPool ? 10 : 100;
        if (--this.fadeT <= 0) {
          this.gone = true;
        }
      }
      return;
    }
    // Zombie::UpdateMowered (9266): the flip driver runs and its track-0
    // matrix rides the body overlay (Update 5273); the body anim keeps
    // playing underneath. On loop: head+arm pop, instant removal with loot
    // already dropped (DieWithLoot) — never the death fall.
    if (this.mowed) {
      if (this.mowDriver) {
        this.mowDriver.update();
        this.body.update();
        this.syncBody();
        this.body.overlay = this.mowDriver.attachmentOverlayMatrix(0);
      } else { this.body.update(); this.syncBody(); }
      if (!this.mowDriver || this.mowDriver.loopCount > 0) {
        this.mowDriver = null;
        this.body.detach(); // overlay back to identity/mirror
        this.dropHead(true); this.dropArm(true);
        // DieWithLoot tail via DieNoLoot (7361): the flip end stops the loop
        // (retail keeps the crank through the 100-tick flip — the stop lands
        // here, not in mowDown()).
        this.stopJackSong();
        // UpdateMowered (9266) ends the flip via DieWithLoot (7255) =
        // DieNoLoot (TrySpawnLevelAward, 7363) + DropLoot — the award attempt
        // matters when the last rival died mid-flip (loot already dropped at
        // mow start, so only the award try is still live here).
        this.board.trySpawnLevelAward(this);
        this.dead = true; this.gone = true;
      }
      return;
    }
    // Zombie::Update PHASE_ZOMBIE_DYING branch (Zombie.cpp:Update): the
    // flat-tired zamboni runs UpdateDeath + UpdateZombieWalking while the 280
    // counter ticks — no groans, targeting, eating, fuses, dancing or bleed.
    // updateZamboniDeath advances the body + syncs like UpdateDeath does via
    // UpdateReanim; velX is 0 from ZamboniDeath so a walk step would be a
    // no-op (kept out — the machine sits while the wheelie plays).
    if (this.phase === "zdying") {
      this.age++;
      this.updateZamboniDeath();
      return;
    }
    // Zombie::UpdatePlaying groans (Zombie.cpp:4478-4506): each zombie ticks
    // its counter down; at 0, with a 1/N pick (N = zombie count), a headed
    // non-boss zombie groans and resets to Rand(1000)+500 — garg rumbles
    // LOW_GROAN, variants use the BRAINS set. No reset on a miss (source has
    // no else branch), and none after the level award drops.
    if (--this.groanCd === 0 && this.hasHead && this.type !== "boss" &&
        !this.board.levelAwardSpawned &&
        Math.floor(Math.random() * this.board.zombies.length) === 0) {
      this.playGroan();
      this.groanCd = 500 + Math.floor(Math.random() * 1000);
    }
    this.age++;
    // Zombie::UpdatePlaying counters, source order (ice trap, then chill,
    // then butter): ice expiry thaws (RemoveIceTrap + the thaw burst at
    // +75/+106); chill/butter hitting zero re-rates (UpdateAnimSpeed).
    if (this.iceTrap > 0) {
      if (--this.iceTrap === 0) {
        this.removeIceTrap();
        this.board.spawnIceRelease(this.x + 75, this.y + 106);
      }
    }
    if (this.chill > 0 && --this.chill === 0) this.updateAnimSpeed();
    // IsImmobilizied (ice trap or butter): the whole action block below is
    // skipped (UpdatePlaying 4520) — the zombie stands frozen mid-frame while
    // the counters above keep ticking. Rate is 0 via updateAnimSpeed's
    // immobilized gate.
    if (this.butter > 0 || this.iceTrap > 0) {
      // Zombie::UpdatePlaying butter wear-off (4525-4532): hitting 0 runs
      // RemoveButter (8451) — re-rate plus the song restart for a headed
      // running jack (StartZombieSound gate, same as removeIceTrap above).
      if (this.butter > 0 && --this.butter === 0) {
        this.updateAnimSpeed();
        if (this.type === "jack" && this.phase === "running" && this.hasHead) this.startJackSong();
        if (this.type === "digger" && this.phase === "tunnel" && this.hasHead) this.startDiggerSong();
      }
      this.body.update(); // frozen mid-frame
      this.syncBody();
      return;
    }
    // Zombie::Update phase-counter tick (4234): mPhaseCounter-- while above 0
    // and not immobilized (the frozen early-return above is the gate).
    if (this.phaseT > 0) this.phaseT--;
    // The dance machine runs on every board zombie — dancers AND backups,
    // allies included (UpdateActions 4403-4410 sits before the ally split in
    // effect: allies dance, freeze, chill and summon exactly like enemies).
    // Same for the jack crank/pop/blast machine (UpdateActions has no mind
    // gate — UpdateZombieJackInTheBox 4379-4381 runs for allies, so a hypno'd
    // jack still pops and takes enemies with 127 while sparing plants).
    this.updateDance();
    if (this.type === "jack" && !this.dead) this.updateJack();
    // Zombie::UpdateZombieRiseFromGrave (Zombie.cpp:3016): the altitude rides
    // TodAnimateCurve(50, 0, counter, ...) — land (counter starts 150,
    // clamped): pinned at -200 until the counter hits 50, then linear to 0;
    // pool (counter starts 50): -150 to the -40 swim line. At 0 the phase
    // goes NORMAL (pool also re-clips the four water tracks, 3036-3042).
    // No walking, eating, or targeting meanwhile (FindTargetAndFire/
    // EffectedByDamage gate the phase).
    if (this.phase === "rising") {
      if (this.inPool) {
        // Pool curve carries mScaleZombie (3018-3020); land does not.
        const sc = this.scaleZombie || 1;
        this.altitude = (-150 + (110 * (50 - Math.min(50, this.riseT))) / 50) * sc;
        this.body.update(); this.syncBody();
        if (--this.riseT <= 0) {
          this.phase = "normal"; this.altitude = -40 * sc;
          for (const tr of ["Zombie_duckytube", "Zombie_whitewater", "Zombie_outerarm_hand", "Zombie_innerarm3"]) this.body.setIgnoreClipRect(tr, true);
        }
        return;
      }
      this.altitude = this.riseT > 50 ? -200 : -200 + 4 * (50 - this.riseT);
      this.body.update(); this.syncBody();
      if (--this.riseT <= 0) { this.phase = "normal"; this.altitude = 0; }
      return;
    }
    // UpdateYuckyFace (4635): at counter 21 (the face image never shows — the
    // ==70 ShowYuckyFace branch is unreachable in normal flow) the zombie
    // stops eating and jumps to 170, diverting the same tick (4638+4673);
    // the face clears at 270 (4652). FOLEY_YUCK has no asset — skipped. The
    // grimace blocks ALL bites once set (EatPlant 6965) — enforced by the
    // caller gate, so no yucky checks are needed inside eatPlant.
    if (this.yucky > 0) {
      this.yucky++;
      if (this.yucky > 20 && this.yucky < 170) {
        this.stopEating();
        this.yucky = 170;
      }
      if (this.yucky > 270) this.yucky = 0;
      else if (this.yucky === 170) {
        this.startWalkAnim(20);
        this.divertRow();
      }
    }
    // Mind-controlled allies run their own combat (FindZombieTarget /
    // EatZombie), but the headless bleed-out (UpdatePlaying 4555-4583, flags
    // 9U) and the backwards board edge (CheckForBoardEdge 4436: x > 850 ->
    // DieNoLoot) apply to them exactly like the normal branch — the old code
    // skipped both, so headless allies never bled and allies walked 40px too
    // far before despawning via `gone` (no award try, no loot funnel).
    if (this.ally) {
      if (this.dead || this.gone) return; // blown mid-update (ally jack blast above)
      if (!this.hasHead) {
        const bleed = this.type === "yeti" ? 10 : this.maxHp >= 500 ? 3 : 1;
        if (Math.random() < 0.2) {
          this.damage(bleed, this.board, 9);
          if (this.dead) { this.body.update(); this.syncBody(); return; }
        }
      }
      // CheckForBoardEdge (4436): backwards walkers die lootless past 850.
      // Zombie::DieNoLoot (7368): award try, no loot, no fall — instant.
      if (this.x > 850) {
        this.board.trySpawnLevelAward(this);
        this.dead = true; this.gone = true;
        return;
      }
      this.updateAlly(); this.body.update(); this.syncBody();
      // Zombie::Animate runs for allies too: the hand-crossing chew sound
      // fires while eating (soft chomps — the effect stays enemies-only,
      // gated inside chewAnimEvents). Silent before this fix.
      this.chewAnimEvents();
      return;
    }
    if (this.type === "bungee") { this.updateBungee(); return; } // own body sync
    if (this.type === "digger" && (this.phase === "tunnel" || this.phase === "digrise" || this.phase === "digstun" || this.phase === "digpause" || this.phase === "digrisenoaxe")) {
      this.updateDigger();
      // TUNNELING advances underground here (UpdateZombieDigger moves via
      // UpdateZombieWalking in source; the port steps x directly in the
      // tunnel branch of updateDigger below). Rise/stun/pause hold still.
      this.body.update(); this.syncBody();
      return;
    }
    // Zombie::UpdateActions per-type phase machines (Zombie.cpp:UpdateActions):
    // the catapult lob machine runs here, ahead of targeting, like source
    // (the jack crank/pop/blast machine runs with the dance machine above —
    // UpdateActions has no mind gate, so allies pop too).
    if (r.lobs) {
      if (this.x < 620 && --this.lobTimer <= 0) {
        this.lobTimer = 300;
        const targets = this.board.allPlants().filter((p) => p.row === this.row && ![16, 33].includes(p.seed));
        if (targets.length) {
          // FindCatapultTarget: deterministic leftmost in-row plant, no roll.
          let p = targets[0];
          for (const q of targets) if (q.col < p.col) p = q;
          // Projectile::DoImpact umbrella branch (Projectile.cpp:585-602):
          // the port lobs no ball entity (direct-kill simplification), so the
          // block maps to the outcome — REFLECTING: SPLAT + reflect particle,
          // plant unharmed; else: UMBRELLA foley + DoSpecial, plant unharmed.
          const u = this.board.findUmbrellaPlant(p.col, p.row);
          if (u) {
            if (u.state === "reflecting") { this.board.sfx("splat"); this.board.spawnUmbrellaReflect(p.x + 20, p.y + 20); }
            // Projectile::DoImpact (Projectile.cpp:597-600): a mid-countdown
            // (TRIGGERED) umbrella swallows the shot silently — no second
            // foley, no re-block.
            else if (u.state !== "triggered") { this.board.sfx("throw2", 1, Math.random() * 2); u.doSpecialUmbrella(); } // FOLEY_UMBRELLA (TodFoley.cpp:83, pitch 2.0)
          } else { p.hp = 0; p.dead = true; this.board.sfx("splat"); }
        }
      }
    }
    if (r.stomps && --this.stompCd <= 0) {
      this.stompCd = 800;
      // retail BossStompContact (Zombie.cpp:9900): SQUISHES every plant in
      // the target row..+1 at col >= 5 — pots included (no seed exclusion;
      // Squish itself gates NotOnGround). Eligibility (BossCanStompRow 9886)
      // is any non-NotOnGround plant in the pair, rows 0-3. (The old code
      // excluded pots/lilies, instant-killed, and capped at 4.)
      const rows = [];
      for (let rr = 0; rr < 4 && rr < this.board.rows; rr++) {
        if (this.board.allPlants().some((p) => !p.dead && !p.squished && p.row >= rr && p.row <= rr + 1 && p.col >= 5)) rows.push(rr);
      }
      if (rows.length) {
        const tr = rows[Math.floor(Math.random() * rows.length)];
        for (const p of this.board.allPlants()) {
          if (p.dead || p.squished) continue;
          if (p.row >= tr && p.row <= tr + 1 && p.col >= 5) p.squish();
        }
      }
      this.board.sfx("thump"); this.board.shake = 20; // FOLEY_THUMP (contact; shake kept port-side, see note)
    }
    // movement / eating (CheckIfPreyCaught gates on zombieNotWalking states)
    // Zombie::UpdateZombieNewspaper (4371): the maddening poll runs with the
    // per-type phase updates — gasp completion flips to NEWSPAPER_MAD.
    if (this.type === "news") this.updateNewspaper();
    // UpdateActions per-type phase machines (Zombie.cpp:185-192): dolphin
    // ride/jump + snorkel dive/surface run ahead of targeting like source.
    if (this.type === "dolphin") this.updateDolphin();
    if (this.type === "snorkel") this.updateSnorkel();
    if (this.type === "balloon") this.updateFlyer();
    // Zombie::UpdateActions (Zombie.cpp:UpdateActions): the bobsled team
    // machine + the zamboni speed/ice machine run every tick, ahead of the
    // walk step and targeting like source.
    if (this.type === "bobsled") this.updateZombieBobsled();
    if (this.type === "zamboni" && this.phase !== "zdying") this.updateZamboni();
    if (this.type === "boss" && this.enterDone === false && this.body.animTime >= 1) {
      this.enterDone = true; this.playZombie("anim_idle", LOOP, 20, 12); // BossPlayIdle
    }
    // Pole-vaulter leap (UpdateZombiePolevaulter): vault rect (-29,0,70,115)
    // finds the plant, then a timed jump (anim_jump @24fps) covering
    // jumpDistance, plus the -150 landing snap. Tall-nuts block the vault
    // mid-leap (bonk + FALLING at animTime 0.6-0.7, 1698-1707) — the vaulter
    // still jumps, it just never clears.
    // PRE_VAULT requires mHasHead (1654): a headless vaulter never jumps.
    if (this.type === "pole" && this.phase === "prevault" && this.hasHead) {
      const v = this.findVaultTarget();
      if (v) this.startVault(v);
    }
    // Pogo hop (UpdateZombiePogo forward bounce, simplified): clears the
    // plant instead of eating it. Tall-nut blocks the hop with PogoBreak
    // (bonk + block + PARTICLE_TALL_NUT_BLOCK, 1416-1427): the stick breaks
    // and the zombie walks from there. Out-of-scope levels only (pogo is L38+).
    // The hop needs the stick: stickless pogos (magnet/tallnut/decapitation)
    // walk through and chew like normal zombies.
    if (this.type === "pogo" && this.vaultT <= 0 && !this.pogoBroken && this.hasObject) {
      const v = this.findVaultTarget();
      if (v && this.x - v.x < 40 && this.x > v.x) {
        if (v.seed === 23) {
          this.board.sfx("bonk");
          this.board.spawnTallnutBlock(v.x + 60, v.y - 20);
          this.pogoBreak(0); // PogoBreak(0U): source also fires the shatter particle here (PARTICLE_ZOMBIE_POGO — no port infrastructure, skipped, noted on pogoBreak)
          this.pogoBroken = true;
        } else { this.x = v.x - 100; this.board.sfx("polevault"); }
      }
    }
    if (this.vaultT > 0) {
      this.x -= this.vaultVel;
      // UpdateZombiePolevaulter IN_VAULT tall-nut block (1694-1707): at
      // animTime 0.6-0.7 re-find the vault target — a tall-nut ends the jump
      // with BONK + TALL_NUT_BLOCK at (plant.mX+60, plant.mY-20), FALLING,
      // mPosX = plant.mX, mPosY -= 30. Progress here is 1 - vaultT/dur.
      const prog = this.vaultDur > 0 ? 1 - this.vaultT / this.vaultDur : 1;
      if (!this.vaultBonked && prog >= 0.6 && prog <= 0.7) {
        const v = this.findVaultTarget();
        if (v && v.seed === 23) {
          this.vaultBonked = true;
          this.board.sfx("bonk");
          this.board.spawnTallnutBlock(v.x + 60, v.y - 20);
          this.height = "falling";
          this.x = v.x; this.y -= 30;
          this.vaultT = 0;
          this.phase = "post"; this.vaulted = true;
          this.startWalkAnim(0);
          this.body.update(); this.syncBody();
          return;
        }
      }
      if (--this.vaultT <= 0) {
        this.x -= 150;
        this.phase = "post"; this.vaulted = true;
        this.startWalkAnim(0); // POST_VAULT re-picks default walk speed
      }
      this.body.update(); this.syncBody();
      return;
    }
    // Zombie::UpdatePlaying (4555): headless zombies (and crippled
    // zamboni/catapult under 200 body hp) are dying: 1 hp/tick damage (3 at
    // bodyMax>=500, 10 for yeti) with a 1/5 chance per tick — flags 9U, so
    // the fall leaves a body — until hp hits 0 and PlayDeathAnim runs. This
    // is the brief still-alive window after decapitation.
    if (!this.ally) {
      let dying = !this.hasHead;
      if ((this.type === "zamboni" || this.type === "catapult") && this.hp < 200) dying = true;
      if (dying) {
        const bleed = this.type === "yeti" ? 10 : this.maxHp >= 500 ? 3 : 1;
        if (Math.random() < 0.2) {
          this.damage(bleed, this.board, 9);
          if (this.dead) { this.body.update(); this.syncBody(); return; }
        }
      }
    }
    // CheckIfPreyCaught (6780): headless zombies find no prey — they never
    // START eating (and deal no more bites). One already mid-bite keeps
    // mIsEating and stands (ZombieNotWalking) without damaging until the
    // bleed-out fells it (StopEating is never called on head loss).
    // CheckIfPreyCaught gates the walk/eat decision (6780: headless, vaulting,
    // flying, maddening-gasps, etc. never start); the grimace blocks new bites once set (6965).
    // Garg/zamboni/catapult never chew (6745-6748 — smash/crush/lob instead).
    // Bobsled teams never catch prey either (CheckIfPreyCaught 6780:
    // IsBobsledTeamWithSled) — the riding team glides through plants and
    // only starts chewing after the crash-unlink.
    // CheckIfPreyCaught water gates (Zombie.cpp:6780): dolphin land/ride/jump
    // + snorkel dive/swim phases, pool height transitions and the tangle drag
    // never start chewing (the poolwalk swim + snorkel-up-to-eat DO eat).
    const inWaterPhase = this.phase === "dolphin-walk" || this.phase === "dolphin-walk-nodolphin" || this.phase === "dolphin-into-pool" || this.phase === "ride" || this.phase === "dolphin-jump" || this.phase === "snorkel-into-pool" || this.phase === "snorkel-walk" || this.height === "in_to_pool" || this.height === "out_of_pool" || this.height === "falling" || this.height === "dragged" || this.isTangleKelpTarget();
    const nochomp = inWaterPhase || this.type === "boss" || this.type === "garg" || this.type === "zamboni" || this.type === "catapult" || (this.type === "bobsled" && this.bobsledPosition() !== -1) || this.phase === "rising" || this.phase === "maddening" || this.phase === "prevault" ||
      this.phase === "digrise" || this.phase === "digstun" || this.phase === "digpause" || this.phase === "digrisenoaxe" || // digger non-walk phases never start eating (only digwalk/digwalknoaxe chew)
      this.phase === "dancerise" || this.phase === "snap" || this.phase === "snaplight" || this.phase === "snaphold"; // CheckIfPreyCaught dance gates (6762-6765): rising backups + snapping dancers never start eating. Pole-vaulters never eat mid-leap setup either (PRE_VAULT 6753 — the vault lunge runs first and returns on its own).
    // NOTE: no houseWalk gate — retail has no WINNER exception in
    // CheckIfPreyCaught, so the loss-sequence winner still chews plants in
    // its path (houseWalk only blocks the mower rescan + bot targeting).
    // Zombie::CheckIfPreyCaught (6794): the opposite-mind-control victim scan
    // runs FIRST — a regular zombie reaching a hypnotized ally in its attack
    // rect eats the ally (EatZombie 7059: 4 damage, flags 9U, gulp on the
    // kill), exactly like allies eat enemies. The plant scan below only runs
    // when no zombie target is found (6801).
    const canPrey = !nochomp && this.hasHead && !this.flying;
    const foe = canPrey ? this.findZombieTarget() : null;
    const target = canPrey ? this.findPlantTarget() : null;
    if ((foe || target) && this.vaultT <= 0 && !this.yucky) {
      // EatPlant DANCING_IN branch (6959-6963): the moonwalking dancer sets
      // the walk-in counter and never starts eating — no bites, no anim.
      if (this.phase === "dancein") {
        this.phaseT = 1;
        this.body.update(); this.syncBody();
        return;
      }
      this.startEating();
      this.updateZombiePool();
      this.checkForPool();
      if (foe) {
        // Zombie::EatZombie (7059): the age-gated 4-damage bite lands on the
        // allied victim (flags 9U), with the gulp when it falls.
        if (this.age % (this.chill > 0 ? BITE_TICKS * 2 : BITE_TICKS) === 0) {
          foe.takeDamage(BITE_DMG, 9);
          if (foe.hp <= 0) this.board.sfx("gulp"); // SOUND_GULP (7065)
        }
      }
      else if (this.age % (this.chill > 0 ? BITE_TICKS * 2 : BITE_TICKS) === 0) this.eatPlant(target);
      this.body.update(); this.syncBody();
      this.chewAnimEvents(); // hand-crossing sound+effect AFTER the reanim advances (Animate 4897)
      return;
    }
    // Grimacing (counter 1-20): keeps standing without biting (6965/4638).
    if (this.yucky > 0 && this.yucky <= 20) { this.body.update(); this.syncBody(); return; }
    if (!this.hasHead && this.eating) { this.body.update(); this.syncBody(); return; }
    this.stopEating();
    if (this.type === "boss") { this.body.update(); this.syncBody(); return; } // retail boss attack rect is null; stomps only
    if (r.smashes) this.smashPlants();
    // Zombie::UpdateZombiePosition (Zombie.cpp:UpdateZombiePosition): the
    // walk step, then CheckForZombieStep — intact-tired zambonis and
    // catapults squash what they drive over. (UpdateZamboni already ran in
    // UpdateActions above.)
    this.updateZombieWalking();
    this.checkForZombieStep();
    // Zombie::UpdateZombiePosition blowing-away tail: blover-blown balloon
    // fliers drift +10/tick and die with loot past x 850.
    if (this.blowingAway) {
      this.x += 10;
      if (this.x > 850) { this.dieWithLoot(); return; }
    }
    // UpdateActions pool heights + CheckForPool land<->pool transitions
    // (UpdatePlaying 221-229: actions, position, prey, pool, high ground).
    this.updateZombiePool();
    this.checkForPool();
    this.body.update(); this.syncBody();
    // CheckForBoardEdge: per-type edge (garg/pole -150, cat/foot/zam -175,
    // dancer/backup/snorkel -130, default BOARD_EDGE -100).
    const t = this.type;
    const edge = (t === "garg" || t === "pole") ? -150 :
      (t === "catapult" || t === "football" || t === "zamboni") ? -175 :
      (t === "dancer" || t === "backup" || t === "snorkel") ? -130 : -100;
    // CheckForBoardEdge (4467): the headless never reach the house — at
    // edge+70 they take 1800 damage instead (which fells them on the spot).
    if (this.x <= edge + (this.hasHead ? 0 : 70)) this.board.zombieReachedHouse(this);
    // CheckForBoardEdge backwards walkers (4436/4467): emerged diggers walk
    // +x (IsWalkingBackwards); past 850 they die lootless (DieNoLoot), never
    // taking the house. Allies ride the same gate in updateAlly above.
    if (!this.ally && this.isDiggerBackwards() && this.x > 850) this.dieNoLoot();
  }
  syncBody() {
    if (this.type === "boss") { this.body.x = BOSS_OX; this.body.y = BOSS_OY; } // pinned (retail mPosX=0,mPosY=0)
    // Zombie::UpdateReanim (Zombie.cpp:5184): the body reanim rides at
    // (imageOffset + 15 + type + 30 - scale*30, imageOffsetY + bodyY - 8 +
    // type + 120 - scale*120) over the int-snapped (mX, mY), i.e. over mPos.
    // Mind-controlled zombies walk backwards: mirrored + 90*scale X shift.
    else {
      const s = this.scaleZombie || 1;
      const t = ZOMBIE_DRAW_OFFSETS[this.type] || ZOMBIE_DRAW_OFFSETS.normal;
      const opp = this.isDiggerBackwards();
      this.body.x = this.x + 15 + t[0] + (opp ? 90 * s : 0) + 30 - s * 30;
      this.body.y = this.y + (-(this.altitude | 0)) - 8 + t[1] + 120 - s * 120;
      // Zombie::GetDrawPos dolphin image offsets (5931): the ride shifts the
      // body +70 X (x-=70 entry teleport stays visually continuous), the
      // jump +70+altitude X, the in-pool body +50 Y.
      if (this.type === "dolphin") {
        if (this.phase === "ride") this.body.x += 70;
        else if (this.phase === "dolphin-jump") this.body.x += 70 + (this.altitude | 0);
        if (this.phase === "dolphin-poolwalk" || this.phase === "dying") this.body.y += 50;
      }
      // Zombie::DrawZombiePart (Zombie.cpp:5023-5026): a tunneling digger
      // renders sunk 50px (anOffsetY += 50), half-buried under its dirt
      // mound — the rise/dirt fx paint over it. Pause/stun/walk phases use
      // the normal origin (rise rides altitude instead).
      if (this.type === "digger" && this.phase === "tunnel") this.body.y += 50;
      // Zombie::UpdateReanim (Zombie.cpp:5229-5232): a scaled-down footballer
      // rides 20 - scale*20 higher (+10 at the Little Trouble 0.5).
      if (this.type === "football" && s < 1) this.body.y += 20 - s * 20;
      this.body.setScale(s, s);
      // DrawZombiePart mirror (Zombie.cpp:5047-5056): moonwalking/dancing
      // troupes render mirrored on beat frames 12-14/18-20 while not eating
      // (mirrored + shifted -30 in draw space, i.e. +30 post-mirror). In
      // steady state the phase always equals the beat phase, so the frame set
      // never coincides with DANCING_IN/DANCING_LEFT — the branch only fires
      // when the phase goes stale (e.g. the frozen horde behind the loss
      // walk-in while the counter advances), exactly like retail.
      this.danceMirror = false;
      if (!opp && (this.type === "dancer" || this.type === "backup") && (this.phase === "dancein" || this.phase === "danceleft") && !this.eating) {
        const f = this.dancerFrame();
        if (f === 12 || f === 13 || f === 14 || f === 18 || f === 19 || f === 20) this.danceMirror = true;
      }
      this.body.overlay.a = this.danceMirror ? -1 : (opp ? -1 : 1); this.body.overlay.b = 0;
      this.body.overlay.c = 0; this.body.overlay.d = 1;
      this.body.overlay.e = this.danceMirror ? 30 : 0; this.body.overlay.f = 0;
    }
    // The carried pole rides the body (retail ticks every reanim globally);
    // its overlay snaps onto the flaghand track at draw time.
    if (this.flagPole && !this.flagPole.dead) {
      this.flagPole.update();
      this.flagPole.x = this.body.x; this.flagPole.y = this.body.y;
    }
    // The ripped-paper "?" surprise rides the zombie at (-11, 0)
    // (AddAttachedReanim 8321) at render order +1, ticking until its PLAY_ONCE
    // ends or the zombie dies (AttachmentReanimTypeDie 8926, in die()).
    if (this.surprise && !this.surprise.dead) {
      this.surprise.update();
      this.surprise.x = this.x - 11; this.surprise.y = this.y;
    }
    // Attached seaweed (RiseFromGrave pool) rides the tracks via the
    // attachment overlay (refreshed in body.update above) for the zombie's
    // whole life — retail systems loop (SYSTEM_LOOPS + PARTICLE_LOOPS) and
    // die only via AttachmentDie, so there is nothing to age out here.
    // Shield-recoil render hook (TakeShieldDamage 7555-7591): the shield pass
    // draws shifted +3->0px while the counter runs down. See reanim.js.
    const spec = ARMOR_STAGES[this.type];
    if (spec && spec.pool !== "helm" && this.body) {
      this.body.recoilTrack = spec.track;
      this.body.recoilDx = this.shieldRecoil > 0 ? (3 * this.shieldRecoil) / 12 : 0;
    }
  }
  // Zombie::UpdateZombieWalking (Zombie.cpp:3996): ground-locked advance when
  // the reanim has a _ground track, raw velX for the fixed-rate movers.
  // Zombie loss walk-in (Zombie::Update 4239-4247 during SCENE_ZOMBIES_WON):
  // the WINNER ticks but never runs UpdatePlaying — no groans, targeting,
  // eating, fuses, dancing, or bleed. Before ShowZombieWalking (lossT<=150,
  // CutScene 2382) it holds its pose (Animate/Reanim still advance); after,
  // it walks via UpdateZombieWalking (+ pool transitions) with no prey — on
  // roof it instead sinks into the chimney via UpdateZombieChimney (9607).
  updateLossWalk(lossT) {
    if (this.justShot > 0) this.justShot--;
    if (this.shieldShot > 0) this.shieldShot--;
    if (this.shieldRecoil > 0) this.shieldRecoil--;
    if (this.dead || this.gone || this.mowed) {
      try { this.body.update(); this.syncBody(); } catch (e) { /* def missing */ }
      return;
    }
    // Zombie::UpdateZombieChimney (Zombie.cpp:9607): TodAnimateCurve over the
    // cutscene clock (4000-5000cs, i.e. lossT 400-500 here) eases altitude
    // 200->0 with CURVE_EASE_IN, clamped outside the window — so the winner
    // holds 200px up until lossT 400, then sinks into the chimney by 500.
    // (syncBody bakes -altitude into body.y, like GetDrawPos mBodyY.)
    if (this.height === "chimney") this.altitude = todAnimateCurve(400, 500, lossT, 200, 0, "easeIn");
    if (lossT > 150) {
      this.stopEating();
      this.updateZombieWalking();
      this.updateZombiePool();
      this.checkForPool();
    }
    try { this.body.update(); this.syncBody(); } catch (e) { /* def missing */ }
  }
  updateZombieWalking() {
    if (this.dead || this.vaultT > 0 || this.zombieNotWalking()) return; // ZombieNotWalking (3837): eating/butter/dance-root/troupe-freeze/maddening standstills
    const t = this.type;
    // USER OVERRIDE (formation-centering, not in source): while a live leader
    // snaps (snap/snaplight/snaphold), the whole troupe holds POSITION while
    // still dancing in place. Retail only freezes the troupe on eat/immobilize
    // (ZombieNotWalking 3887-3902), so surviving backups keep walking the
    // ~50-tick snaphold tail (and the full point+snaphold on re-summons) while
    // the leader is rooted — each summon bakes ~15px of permanent off-center
    // into the formation (measured: sides 0->-15.5, front -100->-115.5, rear
    // +100->+84.5) and every re-summon lets the survivors pull further ahead
    // of the re-anchored leader. The movement gate below keeps the summon
    // offsets (up/down row at x, same row at x-100/+100) exact; the anim-rate
    // side is deliberately untouched (updateAnimSpeed still ground-locks during
    // danceleft), so the held backups march in place with correct rates and
    // resume instantly when the leader rejoins the beat. Orphaned backups
    // (leader dead/gone) are unaffected and keep walking like retail.
    if (t === "dancer" || t === "backup") {
      const L = t === "dancer" ? this : this.danceLeader();
      if (L && (L.phase === "snap" || L.phase === "snaplight" || L.phase === "snaphold")) return;
    }
    const chilled = this.isChilledSpeed();
    let sp;
    if (t === "pogo" || t === "catapult" || this.phase === "ride" || this.phase === "poolwalk" ||
        (t === "balloon" && this.phase === "flying")) {
      sp = this.velX; // Group A: velX with chill slowdown (UpdateZombieWalking
      // 4005 — FLYING only; a popping balloon walks the ground-locked branch
      // below like the other types)
      if (chilled) sp *= CHILL_FACTOR;
    } else if (t === "zamboni" || this.phase === "tunnel" || this.phase === "dolphin-jump" || this.phase === "snorkel-into-pool" || (t === "bobsled" && this.bobsledPosition() !== -1)) {
      // Group B (no chill slowdown): zamboni/tunnel/bobsled-team PLUS the
      // two pool-transition leaps — PHASE_DOLPHIN_IN_JUMP and
      // PHASE_SNORKEL_INTO_POOL both move at mVelX (UpdateZombieWalking
      // 4005-4015). The jump anim's _ground track reads ~0, so without this
      // the diving/jumping zombie freezes mid-air and lands on its target.
      sp = this.velX; // Group B: velX, chill does NOT slow these (zamboni's
      // velX is maintained by updateZamboni every tick, flat tires included;
      // bobsleds only while the team holds the sled — IsBobsledTeamWithSled.
      // Unlinked/crashed bobsleds walk ground-locked below like normals.)
    } else {
      const gs = this.groundStep();
      if (gs !== null) sp = gs; // ground-locked: chill already halved the rate
      else { sp = this.velX; if (chilled) sp *= CHILL_FACTOR; }
    }
    if (this.isDiggerBackwards() || this.phase === "dancein") this.x += sp; // IsWalkingBackwards (hypno/digger) + DANCING_IN (4032): moonwalkers glide +x
    else this.x -= sp;
    // UpdateZombiePosition (Zombie.cpp:4162): ease mPosY toward the lane
    // ground line (roof slope follows the zombie's own X; flat lawns no-op).
    if (this.board.bg === BG.ROOF || this.board.bg === BG.BOSS) {
      const want = zombieRowY(this.board.bg, this.x, this.row, this.type);
      if (this.y < want) this.y = Math.min(want, this.y + 1);
      else if (this.y > want) this.y = Math.max(want, this.y - 1);
    }
  }
  // Zombie::UpdateZamboni (Zombie.cpp:3909): the speed half runs every tick
  // (UpdateActions) — the cruise curve only applies past x 400 on intact
  // tires; flat tires grind velX down 0.0005/tick instead — and the
  // ice-sheet half: the sheet extends left to mPosX+118, clamped to 25
  // (500 on roof), and stays alive (3000 ticks) while the leading edge is
  // still on the board. (Bobsled-bonanza INT_MAX is challenge-only.)
  updateZamboni() {
    if (this.x > 400 && !this.flatTires) {
      const x = this.x;
      this.velX = x >= 700 ? 0.25 : x <= 300 ? 0.05 : 0.25 + (0.05 - 0.25) * ((700 - x) / 400);
    } else if (this.flatTires && this.velX > 0.0005) {
      this.velX -= 0.0005;
    }
    const roof = this.board.bg === BG.ROOF || this.board.bg === BG.BOSS;
    let iceX = this.x + 118;
    const minX = roof ? 500 : 25;
    if (iceX < minX) iceX = minX;
    if (iceX < this.board.iceMinX[this.row]) this.board.iceMinX[this.row] = iceX;
    if (iceX < 800) this.board.iceTimer[this.row] = 3000;
  }
  // Bobsled constants (ConstEnums.h / Zombie.cpp): the crash lasts 150
  // ticks, the limp factor divides the crash slide-back.
  // Zombie::GetBobsledPosition (Zombie.cpp:305577): -1 for non-sled
  // zombies and unlinked ones, 0 for the leader, 1-3 for the followers.
  bobsledPosition() {
    if (this.type !== "bobsled") return -1;
    if (!this.parent && !this.board.zombies.some((z) => z.parent === this)) return -1;
    if (!this.parent) return 0;
    return this.board.zombies.filter((z) => z.parent === this.parent).indexOf(this) + 1;
  }
  bobsledLeader() { return this.parent || this; }
  // Zombie::UpdateZombieBobsled (Zombie.cpp:528050): runs every tick
  // (UpdateActions). CRASHING counts down, then the leader unlinks the team
  // (everyone re-picks speed); SLIDING counts down into BOARDING (anim_jump
  // @20); BOARDING arcs the altitude off the jump animTime (pos 1/3 rise
  // 8->18, pos 0/2 rise -9->18) and never exits — the team rides standing.
  // Then every sled tick refreshes the ice to at least 500, and the leader
  // takes 6 damage (flags 8U, no flash) once it leaves the sheet.
  updateZombieBobsled() {
    if (this.phase === "crashing") {
      if (this.phaseT <= 0) {
        // Recovery only flips the phase here; the re-pick + unlink below are
        // leader-driven (UpdateZombieBobsled: only GetBobsledPosition() == 0
        // unlinks and re-picks — after the links clear, so the whole team
        // rolls the default range, not the 0.6 push speed). The leader's pass
        // covers members whose own update already ran this tick.
        this.phase = "normal";
        if (this.bobsledPosition() === 0) {
          const ex = [];
          for (const z of this.board.zombies) {
            if (z.parent === this) {
              z.parent = null;
              z.phase = "normal";
              ex.push(z);
            }
          }
          for (const z of ex) z.pickRandomSpeed();
          this.pickRandomSpeed();
        } else if (!this.parent || this.parent.dead || this.parent.gone) {
          // Orphan fallback (unreachable in source — leader death cascades):
          // a follower whose leader is gone unlinks and walks alone instead
          // of stranding in CRASHING forever.
          this.parent = null;
          this.pickRandomSpeed();
        }
      }
      return;
    }
    if (this.phase === "sliding") {
      if (this.phaseT <= 0) {
        this.phase = "boarding";
        this.playZombie("anim_jump", PLAY_ONCE_AND_HOLD, 0, 20);
      }
    } else {
      if (this.phase !== "boarding") return;
      const counter = this.body.animTime * 50;
      const k = Math.max(0, Math.min(1, counter / 50));
      const pos = this.bobsledPosition();
      this.altitude = (pos === 1 || pos === 3) ? 8 + 10 * k : -9 + 27 * k;
    }
    if (this.board.iceTimer[this.row] < 500) this.board.iceTimer[this.row] = 500;
    if (this.x + 10 < this.board.iceMinX[this.row] && this.bobsledPosition() === 0) {
      this.takeDamage(6, DMG_NOFLASH);
    }
  }
  // Zombie::BobsledCrash (Zombie.cpp:527F20): fired from DropHelm when the
  // leader's 300-hp sled pool breaks on a body-leaving hit. The sled is
  // gone — narrow rect, CRASHING + 150, walk anim; the followers drop to
  // the lane ground with the leader's speed and a randomized walk phase,
  // then the team walks as normals.
  bobsledCrash() {
    this.altitude = 0;
    this.crashed = true;
    this.phase = "crashing"; this.phaseT = BOBSLED_CRASH_TIME;
    this.startWalkAnim(0);
    const rate = this.body.animRate;
    for (const z of this.board.zombies) {
      if (z.parent !== this) continue;
      z.y = zombieRowY(this.board.bg, z.x, z.row, "bobsled"); // mPosY = GetPosYBasedOnRow (527F20)
      z.altitude = 0;
      z.crashed = true;
      z.phase = "crashing"; z.phaseT = BOBSLED_CRASH_TIME;
      z.playZombie("anim_walk", LOOP, 0, 0);
      z.velX = this.velX;
      z.body.animRate = rate; z.body.animTime = Math.random(); // RandRangeFloat(0,1), not the leader's phase
    }
  }
  // Zombie::BobsledDie (Zombie.cpp:530310): a linked member's death kills the
  // whole team at once — leader + every linked follower go DieNoLoot
  // (award try each, no debris, no loot). Guarded by team-with-sled
  // (crash-unlinked members die alone); no IsOnBoard gate (gameplay-
  // unreachable: nothing out there can land a lethal hit). Terminates: the
  // teammates die via flags, never via die(), so there is no re-cascade.
  bobsledDie() {
    if (this.bobsledPosition() === -1) return;
    const leader = this.parent || this;
    const team = [leader, ...this.board.zombies.filter((z) => z.parent === leader)];
    for (const m of team) {
      if (m.dead) continue;
      this.board.trySpawnLevelAward(m);
      m.dead = true; m.gone = true;
    }
  }
  // Zombie::BobsledBurn (Zombie.cpp:5303A0): any fire death on a linked
  // member burns the leader too, then every follower dies lootless on the
  // spot (DieNoLoot). Recursion terminates on the BURNED-phase guard in
  // applyBurn (the leader's second pass returns immediately).
  bobsledBurn() {
    if (this.bobsledPosition() === -1) return;
    const leader = this.parent || this;
    if (leader !== this && !leader.dead) leader.applyBurn();
    for (const z of this.board.zombies) {
      if (z.parent === leader && !z.dead) {
        this.board.trySpawnLevelAward(z);
        z.dead = true; z.gone = true;
      }
    }
  }
  // Zombie::ZamboniDeath (Zombie.cpp:52E9A0). Spike: flat tires + TIRE_POP
  // (= SOUND_BALLOON_POP, flat) + PHASE_ZOMBIE_DYING with the 280 counter —
  // wheelie2 @10 on a 1/4 roll under x 600, else wheelie1 @12 + a smoke
  // system; velX 0. Anything else: the
  // explosion system at (+80,+60) + DieWithLoot + FOLEY_EXPLOSION.
  zamboniDeath(flags) {
    if (flags & DMG_SPIKE) {
      this.flatTires = true;
      this.board.sfx("balloonpop"); // FOLEY_TIRE_POP (flat, no pitch range)
      this.phase = "zdying"; this.dieT = 280;
      this.board.spawnZamTire(this.x + 29, this.y + 114);
      this.velX = 0;
      if (Math.random() < 0.25 && this.x < 600) {
        this.wheelie2 = true;
        this.playZombie("anim_wheelie2", PLAY_ONCE_AND_HOLD, 10, 10);
      } else {
        this.wheelie2 = false;
        // Source pins this smoke to the zombie_zamboni_1 TRACK at (35,85)
        // (AttachParticleToTrack) — track space, which this port's
        // zombie-space follow systems can't address. The (27,72)
        // zombie-space pin matches the stage-2 stack smoke's
        // AddAttachedParticle(27,72) exactly (verified: that helper is
        // AddTodParticle(mX+x, mY+y)), so the wheelie smoke rides the same
        // verified stack point instead of a guessed frame conversion.
        this.board.spawnZamSmoke(this.x + 27, this.y + 72, this);
        this.playZombie("anim_wheelie1", PLAY_ONCE_AND_HOLD, 10, 12);
      }
    } else {
      this.board.spawnZamExplosion(this.x + 80, this.y + 60, false);
      this.board.sfx("boom"); // FOLEY_EXPLOSION (flat)
      this.dieWithLoot();
    }
  }
  // Zombie::ZamboniDeath dying phase via UpdateDeath (Zombie.cpp:290780):
  // the 280 counter ticks, then the explosion system (EXPLOSION2 when the
  // wheelie2 layer is showing, else EXPLOSION) + DieWithLoot + foley.
  updateZamboniDeath() {
    this.body.update(); this.syncBody();
    if (--this.dieT <= 0) {
      this.board.spawnZamExplosion(this.x + 80, this.y + 60, !!this.wheelie2);
      this.board.sfx("boom");
      this.dieWithLoot();
    }
  }
  // Zombie::CheckForZombieStep (Zombie.cpp:52AD30): after the walk step,
  // intact-tired zambonis and catapults squash what they drive over.
  checkForZombieStep() {
    if ((this.type === "zamboni" || this.type === "catapult") && !this.flatTires) {
      this.checkSquish();
    }
  }
  // Zombie::CheckSquish (Zombie.cpp:52EDB0): the attack rect vs each same-row
  // plant rect, horizontal overlap >= 20, DRIVE_OVER-targetable and not
  // spiky — the first match squashes its whole square.
  checkSquish() {
    const [dx, , aw] = this.attackRect();
    const ax = this.x + dx;
    const cands = this.board.allPlants().slice().sort((a, b) => a.id - b.id);
    for (const p of cands) {
      if (p.row !== this.row || p.dead) continue;
      // Plant::GetPlantRect (Plant.cpp:467EF0): tall-nut (mX+10, full mWidth
      // 80), pumpkin (mX, mWidth-20 = 100), everything else (mX+10, mWidth-20
      // = 60). Cobcannon's (mX, 140) has no seed in this port (PLANTS ends at
      // 41 = explode-o-nut), so no branch for it.
      const px = p.seed === 30 ? p.x : p.x + 10;
      const pw = p.seed === 30 ? 100 : p.seed === 23 ? 80 : 60;
      const xmax = Math.max(ax, px);
      const rmin = ax < px ? ax + aw : px + pw;
      let xov = rmin - xmax;
      const rmax = ax < px ? px + pw : ax + aw;
      if (rmin > xmax && rmin > rmax) xov = rmax - xmax;
      if (xov >= 20 && this.canTargetPlant(p, "drive") && !Zombie.isSpikySeed(p.seed)) {
        this.board.squishAllInSquare(p.col, p.row);
        break;
      }
    }
  }
  // Instantaneous _ground velocity (px/tick): retail GetTrackVelocity
  // (Reanimator.cpp:1179) — dis * SECONDS_PER_UPDATE * rate * scale.
  // Ground-locked walking therefore averages 0.47x velX; the walk anim rate
  // from updateAnimSpeed is what ties them together. Null when the reanim
  // has no _ground track.
  groundStep() {
    const b = this.body;
    if (!b.trackExists("_ground") || b.frameCount <= 0) return null;
    return b.getTrackVelocity("_ground") * (b.scaleX || 1);
  }
  // Zombie::ZombieInitialize per-type mZombieAttackRect (Zombie.cpp:132-661)
  // plus live phase updates (pole post-vault 1728, dolphin ride/jump
  // 1788/1858, pogo-break 1356). Only dx/width matter: GetRectOverlap
  // measures horizontal overlap only, so dy/height are informational.
  // Dolphin always uses the riding rect (the walk-without-dolphin switch at
  // 1858 needs the unmodeled jump); pole uses the default (pre-vault never
  // chews — CheckIfPreyCaught 6753 — and post-vault resets to default 1728).
  // Zombie::GetZombieAttackRect (8278): IsWalkingBackwards mirrors the rect
  // with mWidth (80, 180 for garg) — allies (and emerged diggers) chew with
  // the mirrored rect, so FindZombieTarget measures overlap on the correct
  // side. The old code never mirrored, breaking ally targeting.
  attackRect() {
    let r;
    switch (this.type) {
      case "normal": case "ducky": case "cone": case "bucket":
      case "door": case "flag": case "yeti": case "jack": case "news":
        r = [20, 0, 50, 115]; break; // LoadPlainZombieReanim (938) + inits
      case "zamboni": case "catapult":
        r = [10, -13, 133, 140]; break; // GetZombieAttackRect ZAMBONI/CATAPULT (Zombie.cpp:8278)
      case "ladder": r = [10, 0, 50, 115]; break;
      case "snorkel": r = [-5, 0, 55, 115]; break;
      case "pogo": r = this.hasObject ? [10, 0, 30, 115] : [20, 17, 50, 115]; break; // PogoBreak 1356 rect: stickless pogos chew with the walking rect
      case "balloon": r = [20, 30, 50, 115]; break;
      case "bungee": r = [0, 0, 0, 0]; break; // GetZombieAttackRect BUNGEE (Zombie.cpp:522A10)
      case "dolphin": r = (this.phase === "dolphin-poolwalk" || this.phase === "dolphin-walk-nodolphin") ? [30, 0, 30, 115] : [-29, 0, 70, 115]; break; // post-jump rect (Zombie.cpp:1858) persists — never reset, so walk-without keeps it
      default: r = [50, 0, 20, 115]; break; // pole/football/dancer/backup/imp/digger/bobsled/...
    }
    if (this.isDiggerBackwards()) {
      const mw = this.type === "garg" ? 180 : 80; // mWidth (8288)
      r[0] = mw - r[0] - r[2];
    }
    return r;
  }
  // Vault-rect overlap (UpdateZombiePolevaulter ATTACKTYPE_VAULT).
  // Same x-overlap >= 20 rule (FindPlantTarget 6346) with the pole's wide
  // pre-vault rect (-29,0,70,115) — non-bowling (Zombie.cpp:324).
  // Allocation-order first-match like chew, with the VAULT top gate
  // (6323-6330): GetTopPlantAt ONLY_NORMAL_POSITION — the cell's base, if
  // any, covers lily/pot/pumpkin for vault purposes (a lone under/pumpkin
  // still vaults: top is null so the gate passes).
  findVaultTarget() {
    const ax = this.x - 29, aw = 70;
    const cands = this.board.allPlants().slice().sort((a, c) => a.id - c.id);
    for (const p of cands) {
      if (p.row !== this.row || p.dead) continue;
      if (!this.canTargetVault(p)) continue;
      // Same Plant::GetPlantRect shape as checkSquish (tall-nut full 80,
      // pumpkin mX/100, default mX+10/60).
      const px = p.seed === 30 ? p.x : p.x + 10;
      const pw = p.seed === 30 ? 100 : p.seed === 23 ? 80 : 60;
      const xmax = Math.max(ax, px);
      const rmin = ax < px ? ax + aw : px + pw;
      const rmax = ax < px ? px + pw : ax + aw;
      const xov = (rmin > xmax && rmin > rmax) ? rmax - xmax : rmin - xmax;
      if (xov >= 20) return p;
    }
    return null;
  }
  // CanTargetPlant VAULT flavor (6323-6330): same base gates as chew, but
  // the top gate uses ONLY_NORMAL_POSITION (the cell's base).
  canTargetVault(p) {
    const b = this.board;
    if (!p || p.dead) return false;
    if (p.squished) return false; // NotOnGround (Plant.cpp:463EF0): flattened plants are off the ground — unvaultable (same gate as CanTargetPlant 6256)
    if (b.isBowling) return false;
    if (p.seed === 19) return false;
    if (!this.inPool && b.isPoolSquare(p.col, p.row)) return false;
    if (p.seed === 17 && (p.state === "rising" || p.state === "falling" || p.state === "done")) return false;
    if (this.phase === "tunnel") return p.seed === 4 && p.state === "notready"; // CanTargetPlant tunneling (6267): only arming potatoes
    if (p.seed === 21 && !b.isWaterRow(p.row) && !((b.cell(p.col, p.row) || {}).pot)) return false;
    const cell = b.cell(p.col, p.row);
    if (cell) {
      const top = (cell.base && !cell.base.dead) ? cell.base : null;
      if (top && top !== p && this.canTargetPlantNoTop(top)) return false;
    }
    return true;
  }
  // Zombie::RiseFromGrave (Zombie.cpp:8141): planted AT the grid
  // (x = gridX - 25), then the stage branch. Land (8200-8219, pool N/A, no
  // pool night in scope): altitude buried, PHASE_RISING_FROM_GRAVE for 150
  // ticks, with ZOMBIE_RISE dirt + the GRAVESTONE_RUMBLE foley (whack-a-mole
  // gets DIRT_RISE + WHACK rise — out of scope). Pool (8154-8199): the riser
  // surfaces FROM the water — altitude -150, mInPool, counter 50, normal
  // height, walk anim (swim via StartWalkAnim), tube/foam/hands unclipped,
  // 3x PARTICLE_ZOMBIE_SEAWEED attached (cone/bucket/head + arm + tube) and
  // PoolSplash(false) — no dirt, no rumble.
  riseFromGrave(col, row) {
    const b = this.board;
    this.x = gridToPixelX(col, b.bg) - 25;
    this.y = zombieRowY(b.bg, this.x, row, this.type);
    this.row = row;
    if (b.stageHasPool()) {
      this.altitude = -150;
      this.inPool = true;
      this.phase = "rising";
      this.riseT = 50; // mPhaseCounter (pool branch sets 50, not 150)
      this.height = "normal"; // mZombieHeight normal (not falling)
      this.startWalkAnim(0);
      // RiseFromGrave pool (8162-8165): the four water tracks draw clipped
      // while deep (they unclip at surfacing, 3036-3042).
      for (const tr of ["Zombie_duckytube", "Zombie_whitewater", "Zombie_outerarm_hand", "Zombie_innerarm3"]) this.body.setIgnoreClipRect(tr, false);
      // RiseFromGrave pool (8167-8196): 3 seaweed systems riding the tracks
      // with OverrideParticleScale (scale = mScaleZombie).
      const headTrack = this.type === "cone" ? "anim_cone" : this.type === "bucket" ? "anim_bucket" : "anim_head1";
      const headOx = this.type === "cone" || this.type === "bucket" ? 37 : 30;
      this.attachSeaweed(headTrack, headOx, 20);
      this.attachSeaweed("Zombie_outerarm_upper", 5, 5);
      this.attachSeaweed("Zombie_duckytube", 77, 20);
      this.poolSplash(false); // splash reanim + PLANTING_POOL + PLANT_WATER (8198)
      this.syncBody();
      return;
    }
    this.altitude = -200; // CLIP_HEIGHT_OFF until UpdateZombieRiseFromGrave runs
    this.phase = "rising";
    this.riseT = 150;
    // Zombie::RiseFromGrave land branch (Zombie.cpp:8200-8219, pool N/A):
    // PARTICLE_ZOMBIE_RISE at the zombie center (mPosX+60, mPosY+110) +
    // FOLEY_GRAVESTONE_RUMBLE — fx and body on the SAME tick (8200), so the
    // dirt bursts as the buried body arrives and the hand waves over it.
    // Whack-a-Zombie (8209-8214) gets DIRT_RISE + PARTICLE_WHACK_A_ZOMBIE_RISE
    // instead (dirt splash + same rise arm).
    if (b.isWhack) {
      b.sfx("dirtRise");
      b.spawnZombieRise(this.x + 60, this.y + 110, this.row);
    } else {
      b.sfx("rumble");
      b.spawnZombieRise(this.x + 60, this.y + 110, this.row);
    }
    this.syncBody();
  }
  startVault(plant) {
    const jumpFrames = this.body.trackExists("anim_jump")
      ? this.body.getFramesForLayer("anim_jump").count : 40;
    this.playZombie("anim_jump", PLAY_ONCE_AND_HOLD, 20, 24);
    const dur = Math.max(1, Math.round(jumpFrames / 24 * 100)); // animDuration ticks
    this.vaultVel = (this.x - plant.x - 80) / dur; // jumpDistance / animDuration
    this.vaultT = dur; this.vaultDur = dur; this.vaultBonked = false;
    this.phase = "invault";
    // No code-side pole hide: the reanim data blanks pole/pole2/innerhand2
    // outside the run+jump spans (walk/eat/death = 0 active frames), so the
    // pole rides through the jump (36/43 jump frames) and is gone as soon
    // as the post-vault walk starts — exactly like retail (source never
    // hides the pole at vault time; DropPole fires only on head loss).
    this.board.sfx("polevault");
  }
  // UpdateYuckyFace row divert (4676-4720): sidestep to an adjacent row the
  // zombie can be in — in bounds, not dirt (RowCanHaveZombies), same
  // pool-ness as the current row (pool zombies can't leave the pool).
  divertRow() {
    const b = this.board, r = this.row;
    const wet = b.isWaterRow(r);
    const ok = (q) => q >= 0 && q < b.rows && !b.isDirtRow(q) && b.isWaterRow(q) === wet;
    const up = ok(r - 1), dn = ok(r + 1);
    if (up && dn) this.row = r + (Math.random() < 0.5 ? 1 : -1);
    else if (up) this.row = r - 1;
    else if (dn) this.row = r + 1;
    else return;
    this.y = zombieRowY(b.bg, this.x, this.row, this.type);
  }
  findPlantTarget() {
    // Zombie::FindPlantTarget (Zombie.cpp:6336): GetZombieAttackRect vs
    // GetPlantRect, X-OVERLAP >= 20 (GetRectOverlap, Board.cpp:9178, measures
    // horizontal overlap only — Y never matters). Plant rects
    // (Plant.cpp:5179): (x+10, y, w-20, h) default; tall-nut full width;
    // pumpkin (x, y, w-20); cobcannon (x, y, 140, 80). Y uses the plant's
    // own mY (roof-slope aware), like source — the overlap ignores it anyway.
    // Attack rects are per-type (ZombieInitialize + phase updates):
    // (20,0,50,115) for normal/ducky/cone/bucket/door/flag/yeti/jack/news
    // (LoadPlainZombieReanim 938 + inits); ladder (10,0,50,115); snorkel
    // (-5,0,55,115); pogo (10,0,30,115); balloon (20,30,50,115); dolphin
    // riding (-29,0,70,115) (walk-without-dolphin 1858 unmodeled); everything
    // else — pole post-vault (1728), football, dancer, backup, imp, digger,
    // bobsled — the (50,0,20,115) default.
    // IteratePlants order (6336-6354) is mPlants allocation order — the FIRST
    // overlapping targetable plant wins, NOT the rightmost. Combined with the
    // CanTargetPlant eating-order gate below, in-cell priority is pumpkin >
    // normal > under (lily/pot), and across cells the oldest planting wins
    // when two cells both overlap (rare: 23px inter-rect gap vs 50px attack).
    const b = this.board;
    const [dx, , aw] = this.attackRect();
    const ax = this.x + dx;
    const cands = b.allPlants().slice().sort((a, c) => a.id - c.id);
    for (const p of cands) {
      if (p.row !== this.row || p.dead) continue;
      if (!this.canTargetPlant(p)) continue;
      // Plant::GetPlantRect (Plant.cpp:467EF0): tall-nut (mX+10, full mWidth
      // 80), pumpkin (mX, mWidth-20 = 100), everything else (mX+10, mWidth-20
      // = 60). No cobcannon seed in this port (PLANTS ends at 41).
      const px = p.seed === 30 ? p.x : p.x + 10;
      const pw = p.seed === 30 ? 100 : p.seed === 23 ? 80 : 60;
      // X-overlap, source formula (Board.cpp:9178-9200).
      const xmax = Math.max(ax, px);
      const rmin = ax < px ? ax + aw : px + pw;
      let xov = rmin - xmax;
      const rmax = ax < px ? px + pw : ax + aw;
      if (rmin > xmax && rmin > rmax) xov = rmax - xmax;
      if (xov >= 20) return p;
    }
    return null;
  }
  // Zombie::CanTargetPlant (Zombie.cpp:6256) — CHEW flavor. NotOnGround
  // (squash mid-leap) + TANGLEKELP (6261) are never targets; tunneling
  // diggers only surface for an arming potato (6267-6270); spiky plants are
  // NOT chew targets on land without a pot — zombies walk over spikeweed
  // (taking SpikeweedAttack area damage) — except spiky in pool squares or
  // pots (roof), which chew normally (6272-6280). The CHEW eating-order gate
  // (6314-6321): GetTopPlantAt EATING_ORDER (pumpkin > normal > under =
  // Board.cpp:2258-2261) — a covered plant is untargetable while its cover
  // is itself targetable. Ladder carry/place gates (6295-6312) need ladder
  // phase state this port doesn't model — noted, unmodeled. The mInPool gate
  // (6264: land zombies ignore pool squares) is unmodeled — pool wading has
  // no proxy in this port (all pool-row zombies path over water by design).
  // Bowling (6258) is covered by biteTargets' empty gate, re-checked here
  // for the allocation-order path.
  // Zombie::CanTargetPlant DRIVE_OVER flavor (Zombie.cpp:6282-6293, used by
  // CheckSquish 6482): cherry/jalapeno/blover/squash are never driven over
  // (they detonate/vanish instead); sleeping doom/ice-shrooms are driven over
  // (awake ones detonate/freeze instead). The CHEW eating-order top gate does
  // NOT apply to DRIVE_OVER (no 6314 branch for that flavor).
  static isSpikySeed(seed) { return seed === 21 || seed === 46; } // Plant::IsSpiky (Plant.cpp:649 — spikeweed + spikerock; only 21 in scope)
  canTargetPlant(p, flavor) {
    const b = this.board;
    if (!p || p.dead) return false;
    if (p.squished) return false; // NotOnGround (Plant.cpp:463EF0): squished plants are off the ground — uneatable, undrivable, unvaultable. This is also what stops the per-tick re-squish (and its countdown refresh + foley) while the machine overlaps the flattened plant.
    if (b.isBowling) return false;
    if (p.seed === 19) return false; // TANGLEKELP never a chew target (6261)
    // CanTargetPlant (6264): off-pool zombies never target pool plants.
    if (!this.inPool && b.isPoolSquare(p.col, p.row)) return false;
    if (p.seed === 17 && (p.state === "rising" || p.state === "falling" || p.state === "done")) return false; // NotOnGround (2905)
    if (this.phase === "tunnel") return p.seed === 4 && p.state === "notready"; // CanTargetPlant tunneling (6267): only arming potatoes // tunneling (6267-6270)
    // CanTargetPlant spiky branch (6272-6280): spiky plants ARE targets for
    // garg/zamboni, or in pool squares, or potted (roof) — everyone else
    // walks over them. CheckSquish (6482) still requires !IsSpiky on top of
    // this, so spikeweed is never squashed — the zamboni takes spike damage
    // from it instead (SpikeweedAttack).
    if (Zombie.isSpikySeed(p.seed)) {
      const spikyOk = this.type === "garg" || this.type === "zamboni" ||
        b.isPoolSquare(p.col, p.row) || !!((b.cell(p.col, p.row) || {}).pot);
      if (!spikyOk) return false;
    }
    if (flavor === "drive") {
      if (p.seed === 2 || p.seed === 20 || p.seed === 27 || p.seed === 17) return false; // cherry/jalapeno/blover/squash (6282-6287)
      if (p.seed === 15 || p.seed === 14) return !!p.sleeping; // sleeping doom/ice only (6288-6293)
      return true; // no eating-order top gate for DRIVE_OVER
    }
    const cell = b.cell(p.col, p.row);
    if (cell) {
      const top = (cell.shell && !cell.shell.dead) ? cell.shell
        : (cell.base && !cell.base.dead) ? cell.base
        : (cell.lily && !cell.lily.dead) ? cell.lily
        : (cell.pot && !cell.pot.dead) ? cell.pot : null;
      if (top && top !== p && this.canTargetPlantNoTop(top)) return false; // covered (6314-6321)
    }
    return true;
  }
  // Same gates minus the eating-order top check (for evaluating the cover
  // itself — the cover is top, so its own gate trivially passes). A squished
  // cover still fails (NotOnGround, like source CanTargetPlant on the cover).
  canTargetPlantNoTop(p) {
    const b = this.board;
    if (!p || p.dead) return false;
    if (p.squished) return false;
    if (b.isBowling) return false;
    if (p.seed === 19) return false;
    if (!this.inPool && b.isPoolSquare(p.col, p.row)) return false;
    if (p.seed === 17 && (p.state === "rising" || p.state === "falling" || p.state === "done")) return false;
    if (this.phase === "tunnel") return p.seed === 4 && p.state === "notready"; // CanTargetPlant tunneling (6267): only arming potatoes
    if (Zombie.isSpikySeed(p.seed)) {
      const spikyOk = this.type === "garg" || this.type === "zamboni" ||
        b.isPoolSquare(p.col, p.row) || !!((b.cell(p.col, p.row) || {}).pot);
      if (!spikyOk) return false;
    }
    return true;
  }
  // Zombie::Animate (4853-4912): chew sound+effect fire when the eat anim
  // crosses its hand times — reanim fractions, per type (pole 0.38/0.80,
  // news/ladder 0.42, jack 0.53, bobsled 0.33/0.83, imp 0.33/0.79, else
  // 0.14/0.68). Headless mid-bite chews silently (4853).
  chewAnimEvents() {
    if (!this.eating || !this.hasHead) return;
    // Zombie::Animate (4861): the whole hand-event machine sleeps while the
    // box blows — a jack that was chewing when it popped deals silent bites
    // only (no chomp, no plant flash, no hypno convert mid-pop).
    if (this.type === "jack" && this.phase === "popping") return;
    // AnimateChewSound/Effect (4727/4784): no chew sound or nut particles
    // while surfacing — the up-to-eat transition is silent.
    if (this.phase === "snorkel-up") return;
    const t = this.type;
    let L = 0.14, R = 0.68;
    if (t === "pole") { L = 0.38; R = 0.80; }
    else if (t === "news" || t === "ladder") { L = 0.42; R = 0.42; }
    else if (t === "jack") { L = 0.53; R = 0.53; }
    else if (t === "bobsled") { L = 0.33; R = 0.83; }
    else if (t === "imp") { L = 0.33; R = 0.79; }
    if (this.body.shouldTriggerTimedEvent(L) || this.body.shouldTriggerTimedEvent(R)) {
      this.animateChewSound();
      // Zombie::Animate (4909): mind-controlled zombies make no chew
      // particles — the effect (and its plant flash) is enemies-only.
      if (!this.ally) this.animateChewEffect();
    }
  }
  // Zombie::AnimateChewSound (4725): the hypno convert happens HERE at a hand
  // event (floop + mind control), not on the damage tick; garlic starts the
  // grimace here (chomp); nut/pumpkin chews are soft; FOLEY_CHOMP picks a
  // random chomp/chomp2; mind-controlled zombies with no target chew soft.
  animateChewSound() {
    const b = this.board;
    const chomp = () => b.sfx(Math.random() < 0.5 ? "chomp" : "chomp2");
    const p = this.findPlantTarget(); // snorkel-up-to-eat + IZombie guards N/A
    if (p) {
      if (p.seed === 12 && !p.sleeping) { // hypno converts (4733)
        // Zombie::AnimateChewSound (4735-4744): FLOOP, plant Dies (no gulp —
        // Plant::Die plays nothing), StartMindControlled, PARTICLE_MIND_CONTROL
        // at (mPosX+60, mPosY+40, mRenderOrder+1), TrySpawnLevelAward, then
        // mVelX = 0.17 (NO random re-pick — the old pickRandomSpeed() call here
        // overwrote the 0.17 with a fresh roll) + UpdateAnimSpeed.
        b.sfx("floop"); // FOLEY_FLOOP (4735)
        p.die(); // Plant::Die (4736)
        // Zombie::StartMindControlled (6914): SOUND_MINDCONTROLLED (raw
        // PlaySample, flat), mMindControlled = true, mLastPortalX = -1 (no
        // portals in scope), dancer/backup/related unlink below.
        b.sfx("mindcontrolled"); // SOUND_MINDCONTROLLED (6916)
        this.ally = true;
        // StartMindControlled dance unlink (6920-6943): the converted
        // dancer's troupe keeps shambling (followers keep their link, so
        // they still freeze/chill with it) but the slots clear; the
        // converted backup unlinks from its leader's slot and clears its
        // own link. Bobsleds keep the parent-pair unlink below.
        if (this.type === "dancer") {
          for (let i = 0; i < 4; i++) this.followers[i] = null;
        } else if (this.type === "backup") {
          const L = this.related;
          if (L && L.followers) {
            for (let i = 0; i < 4; i++) if (L.followers[i] === this) { L.followers[i] = null; break; }
          }
          this.related = null;
        } else {
          for (const o of b.zombies) if (o.parent === this) o.parent = null;
          if (this.parent) this.parent = null;
        }
        this.stopEating();
        b.spawnMindControl(this.x + 60, this.y + 40); // PARTICLE_MIND_CONTROL (4739)
        b.trySpawnLevelAward(this); // TrySpawnLevelAward (4740)
        this.velX = 0.17; // (4742)
        // mAnimTicksPerFrame = 18 (4743): our reanim has no such field — the
        // rate comes from UpdateAnimSpeed below, which overwrites it anyway.
        this.updateAnimSpeed(); // (4744)
        return;
      }
      if (p.seed === 36) { // garlic grimace starts here (4746)
        if (!this.yucky) {
          this.yucky = 1;
          chomp(); // FOLEY_CHOMP (4753)
        }
        return;
      }
      if (p.seed === 3 || p.seed === 23 || p.seed === 30) b.sfx("chomp_soft"); // nuts + pumpkin (4758)
      else chomp();
      return;
    }
    if (this.ally) b.sfx("chomp_soft"); // 4770
    else chomp(); // 4776
  }
  // Zombie::AnimateChewEffect (4782): nut chews pop wallnut-eat particles
  // (SMALL, at the zombie's mouth, 4800-4828); EVERY landed chew sets the
  // plant flash (4830) — even impotent chews on fuse plants.
  animateChewEffect() {
    const p = this.findPlantTarget();
    if (!p) return;
    if (p.seed === 3 || p.seed === 23) { // 4800: wall-nut or tall-nut
      // Mouth anchor (4806-4826): mPosX+37, mPosY+40+bodyY with per-type
      // offsets (snorkel/dolphin -7/+70, backwards +47x, balloon +47y,
      // imp +24/+40; bodyY bob N/A — our zombies don't bob). Render order is
      // PROJECTILE-row (4802), same TOP pass as the other fx here.
      let px = this.x + 37, py = this.y + 40;
      if (this.type === "snorkel" || this.type === "dolphin") { px -= 7; py += 70; }
      else if (this.ally) px += 47; // IsWalkingBackwards (hypno allies walk right)
      else if (this.type === "balloon") py += 47;
      else if (this.type === "imp") { px += 24; py += 40; }
      this.board.spawnWallnutEat(px, py, false);
    }
    p.flash = Math.max(p.flash, 25);
  }
  eatPlant(p) {
    // EatPlant (6957): dancer-dancing-in + ladder-climb phases unmodeled.
    // Fuse plants and invulnerable states are chewed impotently: StartEating
    // already ran in the caller, but no damage lands (6982-6996). Asleep
    // doom/ice/hypno chew straight through (6992 falls past the sleep gate).
    if (p.seed === 2 || p.seed === 20) return; // cherrybomb / jalapeno
    if ((p.seed === 15 || p.seed === 14 || p.seed === 12) && !p.sleeping) return; // awake doom/ice/hypno
    // STATE_FLOWERPOT/LILYPAD_INVULNERABLE + SQUASH_LOOK/PRE_LAUNCH (6987-6990):
    // chewed impotently while awake (lilies/pots never sleep, so the gate is
    // just the state). Squash look/prelaunch already covered below; the
    // shared invuln state covers both under-plants.
    if (p.state === "invuln" && !p.sleeping) return;
    if (p.seed === 4 && p.state !== "notready") return; // armed/rising potato (6997)
    if (p.seed === 27) { // BloverTrigger (EatPlant: triggered -> DoSpecial + return, no damage ever lands)
      p.doSpecialBlover();
      return;
    }
    if (p.seed === 14 && !p.sleeping) { // IceTrigger (7007): unreachable in retail too — awake ice
      // returns at the fuse gate above (6992 shadows 7007); the real freeze path is
      // Plant::UpdateIceShroom proximity (our updateIce). Kept to mirror source order.
      this.board.sfx("frozen");
      for (const z of this.board.zombies) if (!z.dead) z.chillFor(1000);
      this.board.flashAt(p.x + 40, p.y + 40, 200);
      p.hp = 0; p.dead = true;
      return; // no gulp, no stopEating — the normal no-target flow stops it next tick
    }
    if (p.seed === 17 && p.state !== "idle") return; // squash look/pre-launch chewed impotently (6989-6990)
    p.hp -= BITE_DMG; // (7030)
    p.recentlyEaten = 50; // mRecentlyEatenCountdown (7031): every damaging bite
    // sets it — feeds the nut idle freeze (AnimateNuts 3175) + the starfruit
    // fire gate (FindStarFruitTarget 845).
    if (p.hp <= 0) {
      p.dead = true; this.board.sfx("gulp"); // SOUND_GULP (7042)
      // Peashooter-died advice (7048): levels 2-4 first-time, peashooter past
      // col 4, fewer than 15 plants standing.
      if (p.seed === 0 && p.col > 4 && this.board.level >= 2 && this.board.level <= 4 && this.board.firstTime && this.board.allPlants().length < 15)
        this.board.displayAdvice("One of your peashooters died!\nTry planting them further to the left!", "L1");
      this.stopEating();
    }
  }
  // (CheckSquish/SquishAllInSquare above is the source-accurate crush path;
  // the old proximity-based crushPlants was an invented stand-in — removed.)
  smashPlants() {
    if (this.age % 100 !== 0) return;
    const t = this.findPlantTarget();
    if (t) { t.dead = true; t.hp = 0; this.board.sfx("chomp"); this.board.shake = 12; }
  }
  // Zombie::FindZombieTarget (6357): the ally's victim scan — the mirrored
  // attack rect vs each candidate's zombie rect. Gates: opposite mind-control
  // flag (6367), not flying, not digger-tunneling / bungee-dive / scream /
  // rise / getting-dropped, not dead-or-dying, same row; X-overlap >= 20, or
  // >= 0 when the victim is already eating (6380). Headless victims are valid
  // targets (no head gate in source). The first match in iteration order wins
  // (retail returns immediately, no leftmost pick).
  findZombieTarget() {
    if (this.phase === "tunnel") return null; // PHASE_DIGGER_TUNNELING KDESC(6359)
    const ar = this.attackRect(); // mirrored for backwards walkers (8286)
    const ax = this.x + ar[0], aw = ar[2];
    for (const z of this.board.zombies) {
      if (this.ally === z.ally) continue; // mMindControlled != (6367)
      if (z.isFlying()) continue; // (6368)
      if (z.phase === "tunnel") continue; // PHASE_DIGGER_TUNNELING (6369)
      // Bungee dive/scream/rise (6370-6372): only the landed bottom is hittable.
      if (z.type === "bungee" && !z.bungeeOnLawn()) continue;
      if (z.phase === "rising") continue; // PHASE_RISING_FROM_GRAVE (6373)
      if (z.dead || z.gone || z.mowed || z.burnT > 0) continue; // IsDeadOrDying (6374)
      if (z.row !== this.row) continue; // (6375)
      const zr = z.zombieRect();
      const xov = getRectOverlap(ax, aw, zr.x, zr.w);
      if (xov >= 20 || (xov >= 0 && z.eating)) return z; // (6378-6383)
    }
    return null;
  }
  updateAlly() {
    // Zombie::CheckIfPreyCaught ally half (6784-6799): headless allies never
    // start eating (6780 gate — they walk through); the bite cadence is the
    // same age%4 (chilled x2) as plant bites; EatZombie deals DAMAGE_PER_EAT
    // with flags 9U and starts eating, gulping when the victim falls (7059).
    // With no victim the ally walks right via the ground-locked step
    // (UpdateZombieWalking + IsWalkingBackwards); the board-edge removal and
    // the headless bleed-out run in update(), like the normal branch.
    // Rising backups and snapping dancers never start (6780 dance gates).
    if (this.phase === "dancerise" || this.phase === "snap" || this.phase === "snaplight" || this.phase === "snaphold") { this.updateZombieWalking(); return; }
    // Popping jacks stand still with no bites while the box blows
    // (zombieNotWalking family — the crank machine above has no mind gate,
    // so allies pop too and must freeze here like the enemy early-return).
    if (this.type === "jack" && this.phase === "popping") return;
    // UpdateZombieNewspaper has no mind-control gate: a gasping ally still
    // completes the gasp into NEWSPAPER_MAD (usually unreachable — the paper
    // never rips on an immune ally — but a pre-convert mad/gasping zombie
    // keeps its phase). Gasping allies stand with no prey (6754).
    if (this.type === "news") this.updateNewspaper();
    if (this.phase === "maddening") return;
    if (!this.hasHead) { this.updateZombieWalking(); return; }
    const best = this.findZombieTarget();
    if (best) {
      if (this.age % (this.chill > 0 ? BITE_TICKS * 2 : BITE_TICKS) === 0) {
        best.takeDamage(BITE_DMG, 9);
        this.startEating(); // (7062)
        if (best.hp <= 0) this.board.sfx("gulp"); // SOUND_GULP (7065)
      }
      return;
    }
   this.stopEating(); // UpdateBiting stops allies with no victim (6816)
   this.updateZombieWalking(); // ground-locked, +x for backwards (3996/3458)
  }
  // Zombie::PickBungeeZombieTarget (Zombie.cpp:1014-1075): weighted cell pick
  // — weight 1 empty, 10000 with a stealable plant. Skips graves, dirt rows,
  // gravebuster cells (cobcannon has no port seed, so the seed-11 gate covers
  // the retail exclusion), cells another bungee already dives at, and — the
  // sunflower mercy rule (1016-1020) — a MakesSun cell once all-but-one
  // sunflowers are already targeted. Empty lawn: no cell (the ctor dies
  // lootless, 1064-1068).
  pickBungeeZombieTarget(col = -1) {
    const b = this.board;
    const sunT = b.countBungeesTargetingSunFlowers();
    const sunN = b.countSunFlowers();
    const cands = [];
    for (let r = 0; r < b.rows; r++) {
      if (b.isDirtRow(r)) continue; // GRIDSQUARE_DIRT (1052)
      for (let c = 0; c <= 8; c++) {
        if (col >= 0 && c !== col) continue;
        const cell = b.cell(c, r);
        if (!cell || cell.grave) continue; // grave grid item (1035)
        if (b.bungeeIsTargetingCell(c, r)) continue; // BungeeIsTargetingCell (1058)
        const p = b.topBungeePlant(c, r);
        if (!p || p.notOnGround()) { cands.push({ t: { col: c, row: r }, w: 1 }); continue; }
        if (p.seed === 11) continue; // gravebuster (+cobcannon: no port seed)
        if (Plant.makesSun(p.seed) && sunT === sunN - 1) continue; // sunflower mercy rule
        cands.push({ t: { col: c, row: r }, w: 10000 });
      }
    }
    if (!cands.length) { this.bungeeCell = null; return; }
    const t = todPickWeighted(cands, Math.random);
    this.bungeeCell = { col: t.col, row: t.row };
    this.row = t.row;
    this.x = gridToPixelX(t.col, b.bg);
    this.y = zombieRowY(b.bg, this.x, t.row, this.type);
  }
  // Zombie::BungeeLanding (Zombie.cpp:1222-1269): the per-dive-tick landing
  // resolution. The scream fires once crossing 1500 (carriers dive mute);
  // an umbrella in the 3x3 at <=40 bounces the diver (BOING + UMBRELLA foley
  // + DoSpecial + rise; the TOP render-order bump has no port equivalent —
  // fixed draw bands). At 0 a cargo carrier releases its rider and rises,
  // while a solo diver bottoms out (phaseT 300, idle).
  bungeeLanding() {
    const b = this.board;
    if (!this.screamed && !this.cargo && this.altitude <= 1500) { // 1222-1229
      this.screamed = true;
      this.bungeeState = "screaming";
      b.sfx(b.bungeeScreamPick()); // FOLEY_BUNGEE_SCREAM set-pick, pitch 2.0 via the PITCH table
    }
    const cell = this.bungeeCell;
    if (!this.cargo && cell && this.altitude <= 40) { // 1230-1244
      const u = b.findUmbrellaPlant(cell.col, cell.row);
      if (u) {
        b.sfx("boing"); // SOUND_BOING (raw sample)
        b.sfx("throw2", 1, Math.random() * 2); // FOLEY_UMBRELLA (TodFoley.cpp:83, pitch 2.0)
        u.doSpecialUmbrella();
        this.bungeeState = "rising";
        this.hitUmbrella = true; // HasShadow false from here on (9298)
        this.playZombie("anim_raise", PLAY_ONCE_AND_HOLD, 0, 36);
        return;
      }
    }
    if (this.altitude <= 0) { // 1245-1269
      this.altitude = 0;
      if (this.cargo) {
        // BungeeDropZombie release (1252-1261): the rider takes the grid and
        // walks; the carrier rises out empty.
        const c = this.cargo;
        this.cargo = null;
        if (!c.dead && !c.gone) {
          c.row = this.row;
          c.x = gridToPixelX(cell.col, b.bg);
          c.y = zombieRowY(b.bg, c.x, this.row, c.type);
          c.held = false; c.carrier = null;
          c.startWalkAnim(0); // PickRandomSpeed + walk layer, like a fresh spawn
        }
        this.bungeeState = "rising";
        return;
      }
      this.bungeeState = "bottom"; // PHASE_BUNGEE_BOTTOM
      this.phaseT = 300;
      this.playZombie("anim_idle", LOOP, 10, 12);
    }
  }
  // Zombie::BungeeStealTarget (Zombie.cpp:1163-1181): grab anim + take the
  // BUNGEE-order top plant unless it's airborne or a gravebuster (no cob
  // seed in this port). The grab anim plays regardless, so an empty cell
  // mimes the steal, then lifts empty.
  bungeeStealTarget() {
    this.playZombie("anim_grab", PLAY_ONCE_AND_HOLD, 0, 24);
    this.bungeeState = "grabbing";
    const cell = this.bungeeCell;
    if (!cell) return;
    const p = this.board.topBungeePlant(cell.col, cell.row);
    if (!p || p.notOnGround() || p.seed === 11) return;
    this.targetPlant = p;
    p.onBungee = "grabbed"; // GETTING_GRABBED_BY_BUNGEE (render-order bump skipped — fixed bands)
  }
  // Zombie::BungeeLiftTarget (Zombie.cpp:1182-1219): the grab looped through
  // -> rise with the plant pinned at 0.1 rate + FLOOP (cattail replant + IZ
  // sun drop have no port seeds — skipped), clearing duplicate target links.
  bungeeLiftTarget() {
    this.playZombie("anim_raise", PLAY_ONCE_AND_HOLD, 0, 36);
    this.bungeeState = "rising";
    const p = this.targetPlant;
    if (!p || p.dead) { this.targetPlant = null; return; }
    p.onBungee = "rising"; // RISING_WITH_BUNGEE
    p.body.animRate = 0.1;
    this.board.sfx("floop"); // FOLEY_FLOOP
    for (const z of this.board.zombies) { // duplicate-target bugfix (1213-1219)
      if (z !== this && z.type === "bungee" && z.targetPlant === p) z.targetPlant = null;
    }
  }
  // Zombie::BungeeDropPlant (Zombie.cpp:7315-7327): a grabbed plant is
  // released; a rising one dies with the carrier.
  bungeeDropPlant() {
    const p = this.targetPlant;
    this.targetPlant = null;
    if (!p || p.dead) return;
    if (p.onBungee === "grabbed") p.onBungee = "none"; // ReleaseGrabbedByBungee
    else if (p.onBungee === "rising") { p.hp = 0; p.die(); }
  }
  // Zombie::BungeeDie (Zombie.cpp:7337-7349): drop the plant, count it eaten,
  // and take a carried rider down too. Wired into every death path
  // (DieNoLoot 7373 funnels here in source).
  bungeeDie() {
    this.bungeeDropPlant();
    this.board.eatenCount = (this.board.eatenCount | 0) + 1; // mPlantsEaten
    const c = this.cargo;
    this.cargo = null;
    if (c && !c.dead && !c.gone) { c.carrier = null; c.dieNoLoot(); }
  }
  updateBungee() {
    const b = this.board;
    this.body.update();
    // Zombie::UpdateZombieBungee (Zombie.cpp:1272-1330): the dive machine.
    // Diving/screaming shed 8px of altitude a tick; the grass-step foley
    // fires crossing 2596 and the scream set-pick crossing 1500 (both
    // cargo-silent). The bottom counts 300 down into the steal (grabbing),
    // whose loop-through lifts (rising); the rise ends at 600 via DieNoLoot
    // (-> BungeeDie). Ouchy has no setter in source (unreachable).
    const st = this.bungeeState;
    if (st === "diving" || st === "screaming") {
      this.altitude -= 8;
      if (!this.cargo && !this.grassStepped && this.altitude <= 2596) { this.grassStepped = true; b.sfx("grassstep"); } // BUNGEE_ZOMBIE_HEIGHT-404, pitch via the PITCH table
      this.bungeeLanding();
    } else if (st === "bottom") {
      // PhaseT ticks in the generic Update head (4234) — read it, don't count it.
      if (this.phaseT <= 0) this.bungeeStealTarget();
    } else if (st === "grabbing") {
      if (this.body.loopCount > 0) this.bungeeLiftTarget();
    } else if (st === "ouchy") {
      if (this.phaseT <= 0) this.dieWithLoot();
    } else if (st === "rising") {
      this.altitude += 8;
      if (this.altitude >= 600) this.dieNoLoot(); // -> BungeeDie
    }
    // "cutscene" street-preview bungees never construct here — static hover.
    this.syncBody();
  }
}

export class Proj {
  constructor(board, o) {
    this.board = board;
    // mPosX/mPosY are the top-left (mX/mY); screen Y for lobbed shots adds
    // mPosZ (UpdateMotion 759-760: mY = mPosY + mPosZ).
    this.x = o.x; this.y = o.y; this.z = o.z | 0;
    this.row = o.row;
    this.type = o.type; this.dmg = o.dmg;
    this.motion = o.motion || "straight"; // straight/back/three/star/puff/lobbed
    this.velX = o.velX ?? 0; this.velY = o.velY ?? 0;
    this.velZ = o.velZ ?? 0; this.accZ = o.accZ ?? 0;
    this.age = 0; // mProjectileAge
    this.trailAccum = 0; // attached PUFFSHROOM_TRAIL spawn accumulator (SpawnRate 20 x0.01)
    this.rangeFlags = o.rangeFlags ?? DR_GROUND; // mDamageRangeFlags
    this.hitTorchwoodGridX = -1; // mHitTorchwoodGridX
    this.fx = null; // ConvertToFireball's REANIM_FIRE_PEA attachment (re-created on load)
    this.shadowY = o.shadowY ?? 0;
    this.rot = o.rot ?? 0; // mRotation (STAR spins; ProjectileInitialize 122-128)
    this.rotSpeed = o.rotSpeed ?? 0; // mRotationSpeed (Rand ±0.05-0.1)
    this.dead = false;
    this.img = board.projImage(o.type);
    // Fire peas keep the retail glow stand-in (the FIRE_PEA reanim is not in
    // the repo art set); the type flips to "fire" on torchwood conversion.
    this.fire = o.type === "fire";
  }
}

// ---------- coins & sun (Lawn/Coin.cpp CoinInitialize/UpdateFall/UpdateCollected) ----------
// Coin mPosX/mPosY is the TOP-LEFT of a 60x60 box; the sun reanim (REANIM_SUN,
// rate 6 loop) rides centered on it. We track CENTER coords instead and
// convert spawn/ground numbers (+30) at the boundaries.
// Motions: sky falls at constant 0.67 to ground 300+Rand(250); plant sun pops
// up (-1.7-rand*1.7, drift -0.4+rand*0.8) with gravity 0.09, landing just below
// its start while scaling 0.4 -> full at +0.02/tick; zombie-drop coins pop
// (-3-rand*2) with gravity 0.15, ground clamped [80,521]. Landed coins sit until
// disappear 750, then fade 15 ticks (UpdateFade) — no blink. Clicked coins fly
// to the counter at delta/21 per axis while shrinking (dist*0.05 clamped
// 0.5..1 x sun scale) and fading (dist*0.035 clamped 0.35..1), scoring inside
// radius 8. Click box is the 60x60 + 15px extra for sun.
// Sun values/scales (GetSunValue/GetSunScale): sun 25 @1, small 15 @0.5,
// large 50 @2.
export class Coin {
  constructor(board, kind, x, y, motion) {
    this.board = board; this.kind = kind;
    // CoinInitialize money shifts (silver/gold -10,-8; diamond -15,-15).
    if (kind === "silver" || kind === "gold") { x -= 10; y -= 8; }
    else if (kind === "diamond") { x -= 15; y -= 15; }
    this.x = x; this.y = y; this.motion = motion;
    this.coinAge = 0; this.dead = false; this.collected = false;
    this.collectX = 0; this.collectY = 0; this.collectDist = 0;
    this.vx = 0; this.vy = 0; this.groundY = y;
    this.hitGround = false; this.disappear = 0; this.fadeCount = 0;
    this.held = false; this.timesDropped = 0; // cursor-held usable link; DroppedUsableSeed drop count
    this.flyT = 0; this.seed = -1;
    this.alpha = 1;
    const sunScale = kind === "smallsun" ? 0.5 : kind === "bigsun" ? 2.0 : 1.0;
    this.sunScale = this.isSun() ? sunScale : 1;
    if (motion === "sky") { this.y = 90; this.vy = 0.67; this.groundY = 330 + Math.floor(Math.random() * 250); } // Rand(250)+300 top-left → +30 center
    else if (motion === "plant") {
      this.vy = -1.7 - Math.random() * 1.7; this.vx = -0.4 + Math.random() * 0.8;
      this.groundY = y + 15 + Math.floor(Math.random() * 20); // Rand(20)
      this.scale = 0.4;
    } else if (motion === "mower") {
      // CoinInitialize COIN_MOTION_LAWNMOWER_COIN (Coin.cpp:348-353):
      // vel 0, groundY 600, Collect() at birth — the coin auto-flies to
      // the bank and scores on arrival, no click needed.
      this.vx = 0; this.vy = 0; this.groundY = 600; this.collected = true;
      this.scale = 1;
      // (Vase usable seeds arrive via COIN_MOTION_FROM_PLANT — the "plant"
      // branch above — per Challenge::ScaryPotterOpenPot 4234. No separate
      // coin-motion branch: FROM_PLANT pops (vy -1.7-rand1.7, vx -0.4+rand0.8,
      // groundY y+15+rand20 unclamped, scale 0.4 growing to sun scale) with
      // 0.09 gravity (UpdateFall 485-488).)
    } else {
      this.vx = -0.5 + Math.random(); this.vy = -3 - Math.random() * 2;
      this.groundY = Math.max(80, Math.min(521, y + 45 + Math.floor(Math.random() * 20))); // Rand(20), clamped [80,521]
      this.scale = 1;
    }
    // CoinInitialize award branch (333-345): award coins rest 30px higher.
    if (this.isAward()) this.groundY -= 30;
    if (motion !== "plant") this.scale = this.sunScale;
    this.value = kind in SUN_VAL ? SUN_VAL[kind] : 0;
    this.money = kind in COIN_VAL ? COIN_VAL[kind] : 0;
    this.reanim = null;
    // CoinInitialize PlayLaunchSound (Coin.cpp:395-398 -> 1304-1315): diamond
    // (and out-of-scope chocolate/presents) spawns with FOLEY_CHIME — flat,
    // no pitch range. Silver/gold/sun launch silently. The FROM_PRESENT gate
    // is a no-op here (no present-motion coins in scope).
    if (kind === "diamond" && motion !== "present") this.board.sfx("chime");
  }
  update() {
    this.coinAge++;
    if (this.fadeCount > 0) { // UpdateFade: frozen while fading out, then gone
      this.alpha = (this.fadeCount / 15);
      if (--this.fadeCount <= 0) this.dead = true;
      return;
    }
    if (this.collected) this.updateCollected();
    else this.updateFall();
    if (this.reanim) { this.reanim.update(); this.reanim.x = this.x; this.reanim.y = this.y; this.reanim.setScale(this.scale); }
  }
  updateFall() {
    if (this.y + this.vy < this.groundY) {
      this.y += this.vy;
      if (this.motion === "plant") this.vy += 0.09;
      else if (this.motion === "coin") this.vy += 0.15;
      this.x += this.vx;
      if (this.x > BOARD_W - 30) { this.x = BOARD_W - 30; this.vx = -0.4 - Math.random() * 0.4; }
      else if (this.x < 30) { this.x = 30; this.vx = 0.4 + Math.random() * 0.4; }
    } else {
      // Coin::PlayGroundSound (Coin.cpp:1317-1325): gold thuds FOLEY_MONEYFALLS
      // on first ground contact (flat, pitch 0.0f); silver/diamond/sun land
      // silently.
      if (!this.hitGround) { this.hitGround = true; if (this.kind === "gold") this.board.sfx("moneyfalls"); }
      this.y = this.groundY; this.x = Math.round(this.x);
      // IsLevelAward coins never auto-disappear (568): they rest with the
      // bouncy arrow until clicked. Usable seed packets rest 1500 ticks
      // (Coin::GetDisappearTime usable-seed branch); everything else 750.
      // A cursor-held usable packet rides the cursor (Collect 1240-1251) and
      // must not expire mid-carry — disappear only ticks while resting.
      const limit = this.kind === "usable" ? 1500 : 750;
      if (!this.held && !this.isAward() && ++this.disappear >= limit) this.fadeCount = 15; // StartFade
    }
    if (this.motion === "plant") this.scale = Math.min(this.scale + 0.02, this.sunScale);
  }
  updateCollected() {
    if (this.isAward()) { this.updateAwardFlight(); return; }
    // Coin::UpdateCollected: sun flies to the dial, money to (39,558)
    // (store dialog/zen branches N/A in adventure 1-9). The sun
    // target (15,0) is the dial's corner in source; ours aims at the icon.
    // Money target ADJUSTMENT (user-verified): source (39,558) is the coin's
    // mPosX/mPosY, whose reanim rides at +9,+9 with its own track offsets —
    // but this port draws the reanim AT (c.x,c.y), so flying to (39,558)
    // parks the drawn coin up-left of the bank. Measured live (frozen gold
    // at arrival scale 0.55 / alpha 0.4 = the actual arrival look, bank
    // hidden, 4 anim frames): the drawn gold centroid sits at +(11.0,+11.3)
    // from (c.x,c.y), stable within 1px across frames (alpha-1 surveys read
    // ~2px lower — the dim glow halo biases the thresholded centroid, so
    // the arrival-alpha number is the right one). The bank art
    // (coinbank.png 144x32 at (57,599-32)) carries its gold coin at image
    // centroid (27.2,15.8), i.e. screen (84.3,582.9) — confirmed live with
    // the bank alone on screen. So the flight target is
    // (84.3-11.0, 582.9-11.3) = (73,572), landing the drawn coin on the
    // bank's gold coin center (arrival scale 0.5-0.6 + 12px score radius add
    // only ~1-2px of wobble, same as source).
    const t = this.isSun() ? { x: 45, y: 30 } : { x: 73, y: 572 };
    const dx = t.x - this.x, dy = t.y - this.y;
    if (this.x > t.x) this.x -= -dx / 21; else if (this.x < t.x) this.x += dx / 21;
    if (this.y > t.y) this.y -= -dy / 21; else if (this.y < t.y) this.y += dy / 21;
    this.collectDist = Math.hypot(t.x - this.x, t.y - this.y);
    if (this.collectDist < (this.isSun() ? 8 : 12)) { this.dead = true; this.board.collectCoin(this); return; }
    this.scale = Math.max(0.5, Math.min(1, this.collectDist * 0.05)) * this.sunScale;
    this.alpha = Math.max(0.35, Math.min(1, this.collectDist * 0.035));
  }
  isSun() { return this.kind in SUN_VAL; }
  isMoney() { return this.kind in COIN_VAL; } // Coin::IsMoney (silver/gold/diamond)
  isUsable() { return this.kind === "usable"; } // COIN_USABLE_SEED_PACKET (vase seed)
  isAward() { return typeof this.kind === "string" && this.kind.lastIndexOf("award-", 0) === 0; }
  // Coin::UpdateCollected award branch (641-653): the collected award flies
  // to screen center (400-w/2, 200-h/2) while growing 1.01x -> 2x. mDisappear-
  // Counter doubles as the flight clock (flyT); pos eases out over 350 ticks,
  // scale eases in-out over 400 (TodCurves — quadratic approximations).
  updateAwardFlight() {
    const w = this.kind === "award-seed" ? 50 : this.kind === "award-shovel" || this.kind === "award-taco" ? 80 : 109;
    const h = this.kind === "award-seed" ? 70 : this.kind === "award-shovel" || this.kind === "award-taco" ? 80 : 94;
    const t = ++this.flyT;
    const px = Math.min(1, t / 350), ps = Math.min(1, t / 400);
    const eo = 1 - (1 - px) * (1 - px);
    const eio = ps < 0.5 ? 2 * ps * ps : 1 - Math.pow(-2 * ps + 2, 2) / 2;
    this.x = this.collectX + (400 - w / 2 - this.collectX) * eo;
    this.y = this.collectY + (200 - h / 2 - this.collectY) * eo;
    this.scale = 1.01 + (2.0 - 1.01) * eio;
  }
}

// ---------- limb + armor debris ----------
// Flying heads/arms (Zombie::DropHead 3402 / DropArm 3758 + SetupReanimForLostArm
// 3585) and falling armor (DropShield 7482 / DropHelm 7614). Physics tables parsed
// from the raw SexyAppFramework/particles/*.xml in scratch/pvz-source.zip:
//   head: img IMAGE_ZOMBIEHEAD (standalone full-head sprite + per-type
//     OverrideImage), dur 180 (ParticleDuration + SystemDuration), speed
//     330x0.01, angle [150 185]deg, gravity field y=17 (vy += 0.01*17/tick),
//     ground floor spawnY+90, spin [-720,720] -> 0 by 40% life, bounce reflect
//     0.3 (0 past 50%), bounce-spin [-6,-3]/1000, scale 0.8.
//     Ours renders per-type sprite art at the same 0.8, and the posed
//     head1+head2 composite (same silhouette) at 1.0 for the generic types
//     (body-true, user override); position = union center rather than
//     GetTrackPosition+offsets.
//   arm: dur 60, speed 40x0.01, angle [90 185]deg, gravity y=15, floor
//     spawnY+60, spin [0,360] -> 0 by 40%, reflect 0.5, spin [3,6]/1000.
//   flag: dur 50, speed 200x0.01, angle [120 160], gravity y=17, floor +90,
//     rightward wind 100x0.01, spin [-600,-200], fade last 20%, scale 0.8.
//   cone (ZombieTrafficCone.xml): IMAGE_REANIM_ZOMBIE_CONE3 (the badly-cracked
//     stage-3 art, matching the override applied at damage index 2), dur 50,
//     speed 200x0.01, angle [100 140], gravity y=17, floor +90, spin
//     [-200,-400] -> 0 by 40%, reflect 0.3, spin [-3,-6], scale 0.8.
//   pail (ZombiePail.xml): IMAGE_REANIM_ZOMBIE_BUCKET3, dur 50, angle
//     [120 180], otherwise identical to the cone.
//   helmet (ZombieHelmet.xml): IMAGE_REANIM_ZOMBIE_FOOTBALL_HELMET3, dur 50,
//     angle [120 180], otherwise identical to the cone.
//   headlight (ZombieHeadLight.xml): IMAGE_REANIM_ZOMBIE_DIGGER_HARDHAT3,
//     dur 50, angle [180 240], spin [200,400] -> 0 by 40%, spin [3,6]
//     (positive — tumbles the other way), scale -0.8 mirrored in source via
//     ParticleScale -0.8 + ParticleStretch -1 (mirroring skipped here, the
//     hardhat reads the same either way), floor +90.
//   door (ZombieDoor.xml): IMAGE_REANIM_ZOMBIE_SCREENDOOR3, dur 40, angle
//     [120 180], gravity y=17, floor +30, spin [-200,-400], reflect 0.3.
//   newspaper (ZombieNewspaper.xml): IMAGE_REANIM_ZOMBIE_PAPER_PAPER3, dur 40,
//     angle [120 180], gravity y=17, NO GroundConstraint and NO
//     CollisionReflect in source — it falls through and never bounces
//     (floor null below disables the clamp+bounce); the .8/.33 scale+stretch
//     is approximated with uniform 0.8.
//   ladder (ZombieLadder.xml): IMAGE_REANIM_ZOMBIE_LADDER_1_DAMAGE2, dur 40,
//     angle [100 120], gravity y=17, floor +30, spin [-400,-500] -> 0 by 40%.
// Launch convention (SpawnParticle 431-432): angle 0 = straight down,
// vx = sin*speed, vy = cos*speed. Integration order per tick (UpdateParticle
// 619): age check, gravity field, ground clamp+bounce, pos += vel, spin.
// Chilled/mindcontrolled tint (OverrideParticleColor) and the limb-pop sound
// (FOLEY_LIMBS_POP — no matching asset in our audio set) are skipped.
// FADE (user override, differs from source on purpose): source fades each
// particle over its SystemAlpha tail (head last 5%, arm 10%, flag/helm/pail/
// headlight 20%, door/ladder/newspaper 40%) — but the user wants every fallen
// part to dissolve exactly like the dying body (mZombieFade 100->0, alpha =
// fade/10: full opacity, then a 10-tick dissolve). So every debris kind holds
// alpha 1 until 10 ticks before removal, then ramps to 0 — the P.fade values
// below are the parsed source tails, kept for reference only.
// Ours renders posed composites of the worn armor tracks (captured BEFORE the
// caller hides them, so the stage-3 cracked art rides along) instead of the
// standalone retail sprites our atlases lack.
const LIMB_DEBRIS = {
  head: { dur: 180, speed: 3.3, ang0: 150, ang1: 185, grav: 17, floor: 90, spinLo: -720, spinHi: 720, kickLo: -6, kickHi: -3, refl: [[0, 0.3], [0.5, 0]], fade: 0.95, scale: 0.8 },
  // ZombieHeadPool.xml (DropHead 3442: mInPool picks HEAD_POOL): same launch
  // as the land head (speed 330, angle [150 185], gravity 17, scale .8, spin
  // [-720 720]) but SystemDuration 50 with NO GroundConstraint and no
  // reflect/spin-kick — the head arcs once and sinks instead of bouncing.
  headPool: { dur: 50, speed: 3.3, ang0: 150, ang1: 185, grav: 17, floor: null, spinLo: -720, spinHi: 720, kickLo: 0, kickHi: 0, refl: null, scale: 0.8 },
  arm: { dur: 60, speed: 0.4, ang0: 90, ang1: 185, grav: 15, floor: 60, spinLo: 0, spinHi: 360, kickLo: 3, kickHi: 6, refl: [[0, 0.5]], fade: 0.9, scale: 0.8 },
  flag: { dur: 50, speed: 2.0, ang0: 120, ang1: 160, grav: 17, floor: 90, windX: 1.0, spin0: 30, spinLo: -600, spinHi: -200, kickLo: -6, kickHi: -3, refl: [[0, 0.3], [0.4, 0.3], [0.5, 0]], fade: 0.8, scale: 0.8 },
  cone: { dur: 50, speed: 2.0, ang0: 100, ang1: 140, grav: 17, floor: 90, spinLo: -200, spinHi: -400, kickLo: -6, kickHi: -3, refl: [[0, 0.3]], fade: 0.8, scale: 0.8 },
  pail: { dur: 50, speed: 2.0, ang0: 120, ang1: 180, grav: 17, floor: 90, spinLo: -200, spinHi: -400, kickLo: -6, kickHi: -3, refl: [[0, 0.3]], fade: 0.8, scale: 0.8 },
  helmet: { dur: 50, speed: 2.0, ang0: 120, ang1: 180, grav: 17, floor: 90, spinLo: -200, spinHi: -400, kickLo: -6, kickHi: -3, refl: [[0, 0.3]], fade: 0.8, scale: 0.8 },
  headlight: { dur: 50, speed: 2.0, ang0: 180, ang1: 240, grav: 17, floor: 90, spinLo: 200, spinHi: 400, kickLo: 3, kickHi: 6, refl: [[0, 0.3]], fade: 0.8, scale: 0.8 },
  door: { dur: 40, speed: 2.0, ang0: 120, ang1: 180, grav: 17, floor: 30, spinLo: -200, spinHi: -400, kickLo: -6, kickHi: -3, refl: [[0, 0.3]], fade: 0.6, scale: 0.8 },
  newspaper: { dur: 40, speed: 2.0, ang0: 120, ang1: 180, grav: 17, floor: null, spinLo: -200, spinHi: -400, kickLo: 0, kickHi: 0, refl: null, fade: 0.6, scale: 0.8 },
  ladder: { dur: 40, speed: 2.0, ang0: 100, ang1: 120, grav: 17, floor: 30, spinLo: -400, spinHi: -500, kickLo: -6, kickHi: -3, refl: [[0, 0.3]], fade: 0.6, scale: 0.8 },
};
const segVal = (nodes, t) => {
  if (t <= nodes[0][0]) return nodes[0][1];
  for (let i = 1; i < nodes.length; i++) {
    if (t <= nodes[i][0]) {
      const [t0, v0] = nodes[i - 1], [t1, v1] = nodes[i];
      return v0 + (v1 - v0) * ((t - t0) / (t1 - t0));
    }
  }
  return nodes[nodes.length - 1][1];
};
// Chilled-debris tint (user override): body-part debris (head/arm) that pops
// while the zombie is chilled renders the same blue as a chilled zombie body
// (Zombie::Draw 5088: rgb -> (2r*75/255, 2g*75/255, min(255,2b))). Baked into
// the posed-composite canvas at detach time, so later chill wear-off can't
// change it. Helm/shield debris (cone/pail/helmet/headlight/door/newspaper/
// ladder) and the flag pole are never tinted.
function tintShotChilled(shot) {
  try {
    const c = shot.img, g = c.getContext("2d");
    const id = g.getImageData(0, 0, c.width, c.height), d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      d[i] = (d[i] * 150 / 255) | 0;
      d[i + 1] = (d[i + 1] * 150 / 255) | 0;
      d[i + 2] = Math.min(255, d[i + 2] * 2);
    }
    g.putImageData(id, 0, 0);
  } catch (e) { /* art-less: leave untinted */ }
}
export class Debris {
  constructor(board, kind, x, y, row, shot) {
    const P = LIMB_DEBRIS[kind];
    this.board = board; this.kind = kind; this.row = row;
    this.x = x; this.y = y; this.oy = y;
    const th = (P.ang0 + Math.random() * (P.ang1 - P.ang0)) * Math.PI / 180;
    this.vx = Math.sin(th) * P.speed; this.vy = Math.cos(th) * P.speed;
    if (P.windX) this.vx += P.windX; // ZombieFlag.xml <Velocity><X>100</X> wind
    this.spin = (P.spin0 || 0) * Math.PI / 180; this.spinVel = 0; // ParticleSpinAngle (flag: 30deg)
    this.spin0 = P.spinLo + Math.random() * (P.spinHi - P.spinLo);
    this.kick = P.kickLo + Math.random() * (P.kickHi - P.kickLo);
    this.age = 0; this.alpha = 1; this.dead = false;
    // Posed-composite art is baked at body scale; per-type head sprites are
    // standalone art. Each shot carries its own draw scale
    // (head sprites 0.8 per ZombieHead.xml, composite heads 1.0 body-true per
    // user override); the table scale is the fallback.
    this.img = shot.img; this.cx = shot.cx; this.cy = shot.cy;
    this.s = shot.s ?? P.scale;
  }
  update() {
    const P = LIMB_DEBRIS[this.kind];
    if (this.age >= P.dur) { this.dead = true; return; }
    const t = this.age / (P.dur - 1);
    this.vy += 0.01 * P.grav;
    // ZombieNewspaper.xml has no GroundConstraint field: the paper falls
    // through and never bounces (floor null skips the whole clamp).
    if (P.floor !== null && P.floor !== undefined) {
      const floor = this.oy + P.floor;
      if (this.y > floor) { // FIELD_GROUND_CONSTRAINT (TodParticle.cpp:510)
        this.y = floor;
        this.spinVel = this.vy * segVal([[0, this.kick], [0.4, 0]], t) / 1000;
        if (P.refl) { this.vx *= segVal(P.refl, t); this.vy *= -segVal(P.refl, t); }
        else { this.vx = 0; this.vy = 0; }
      }
    }
    this.x += this.vx; this.y += this.vy;
    const s = this.spin0 * Math.max(0, 1 - t / 0.4);
    this.spin += s * 0.01 * Math.PI / 180 + this.spinVel;
    // Body-style fade (user override, see the LIMB_DEBRIS comment): full
    // opacity until 10 ticks before removal, then a linear 10-tick dissolve —
    // the same curve as mZombieFade (alpha = fade/10), not the source
    // SystemAlpha proportional tails.
    this.alpha = this.age >= P.dur - 10 ? Math.max(0, (P.dur - this.age) / 10) : 1;
    this.age++;
  }
  draw(ctx, camX, camY) {
    if (!this.img || this.alpha <= 0) return;
    const s = this.s; // per-shot: sprite heads 0.8, composite heads 1.0, arms/armor/flag 0.8
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.translate(this.x + camX, this.y + camY);
    ctx.rotate(this.spin);
    ctx.drawImage(this.img, -this.cx * s, -this.cy * s, this.img.width * s, this.img.height * s);
    ctx.restore();
  }
}

// ---------- board ----------

// Almanac type->index map (ConstEnums.h ZombieType order): INVALID -1,
// NORMAL 0 .. BOSS 25. Used by Board.noteZombieDefeated.
const ZOMBIE_ALMANAC_IDX = {
  normal: 0, flag: 1, cone: 2, pole: 3, bucket: 4, news: 5, door: 6,
  football: 7, dancer: 8, backup: 9, ducky: 10, snorkel: 11, zamboni: 12,
  bobsled: 13, dolphin: 14, jack: 15, balloon: 16, digger: 17, pogo: 18,
  yeti: 19, bungee: 20, ladder: 21, catapult: 22, garg: 23, imp: 24, boss: 25,
};
export class Board {
  constructor(level, libs, opts = {}) {
    this.level = level; this.libs = libs;
    // LawnApp::IsFirstTimeAdventureMode = adventure && !finished (LawnApp.cpp:2539).
    this.finished = !!opts.finished;
    this.firstTime = !this.finished;
    // Almanac defeated set (AlmanacDialog gZombieDefeated + DropLoot 7211):
    // almanac indices (0..25) of zombie types killed on this board. Marked in
    // Zombie.die + the head-pop DropLoot path; main.js flushes the set into
    // the profile (SAVE.markZombieDefeated) so the sim stays save-free.
    this.zombieDefeated = new Set();
    this.packetUpgrade = opts.packetUpgrade | 0 || 0;
    // Crazy Dave shop cleaner purchases (StoreItem POOL 22 / ROOF 23,
    // LawnMowerInitialize + InitLawnMowers 1642-1662): water rows get lawn
    // mowers that sink until the pool purchase, roof rows get no mowers at
    // all until the roof purchase. Wall-nut First Aid (StoreItem FIRSTAID 29,
    // Board::CanPlantAt 2882/2952) gates damaged-nut/pumpkin repair planting.
    // All threaded in from SAVE by the level entry points.
    this.hasPoolCleaner = !!opts.poolCleaner;
    this.hasRoofCleaner = !!opts.roofCleaner;
    this.firstAid = !!opts.firstAid;
    // Garden-rake purchase (StoreItem RAKE 24, Board::PlaceRake 1590-1639):
    // lasts 3 levels, decremented at placement. Threaded in from SAVE by
    // the level entry points; the cutscene consumes one via placeRake().
    this.rakeLeft = opts.rake | 0 || 0;
    this.rake = null; // GridItem GRIDITEM_RAKE (Board::PlaceRake 1630-1638)
    // CutScene::PlaceLawnItems runs save-free (cutscene.js never touches
    // SAVE), so the level entry points arm this hook to persist the
    // decrement (main.js: SAVE.setPurchase(24, left)).
    this.onRakePlaced = null;
    this.bg = backgroundForLevel(level);
    this.rows = stageRows(this.bg);
    // Whack-a-Zombie adventure flag (LawnApp::IsWhackAZombieLevel 2149-2158).
    this.isWhack = isWhackLevel(level);
    // Vasebreaker adventure flag (LawnApp::IsScaryPotterLevel 2167).
    this.isVase = isVasebreaker(level);
    // Stormy-night adventure flag (LawnApp::IsStormyNightLevel 2176-2185).
    this.isStormy = isStormyNightLevel(level);
    // Challenge state (Challenge::mChallengeState/mChallengeStateCounter/mRainCounter):
    // the stormy-night lightning state machine + the rain-splash timer.
    // STORM_FLASH_TIME = 150 (all reset formulas + DrawStormNight math).
    this.stormState = "normal"; // ChallengeState (flash1/flash2/flash3/normal)
    this.stormCounter = 0; // Challenge::mChallengeStateCounter
    this.rainCounter = 0; // Challenge::mRainCounter
    this.rainFx = []; // UpdateRain splash/circle reanims (transient, never saved)
    this.fxClock = 0; // free-running intro rain-drift clock (mEffectCounter; cutscene-only, never saved)
    // Challenge::InitLevel storm branch (348-353): FLASH_2/100 + the looping
    // FOLEY_RAIN. Runs at board construction (fresh + resume alike).
    if (this.isStormy) {
      this.stormState = "flash2";
      this.stormCounter = 100;
      try { this.libs.startLoop("rain"); } catch (e) { /* headless */ }
    }
    // Challenge state counter (Challenge::mChallengeStateCounter): the whack
    // spawn state machine's per-batch countdown.
    this.challengeCounter = 0;
    // Seed-bank slide for whack (Challenge::Update 2172-2182): the cutscene
    // bank stays hidden (IsChallengeWithoutSeedBank gate) and slides in
    // +2/tick once sun exists. Non-whack boards draw at rest. The vase bank
    // never slides in (adventure vase has no sun) — stays hidden like whack.
    this.bankY = (this.isWhack || this.isVase) ? -87 : 0;
    // PlantRow dirt (Board::PickBackground 1023-1037) — unsodded tutorial rows.
    this.dirtRows = new Set(dirtRowsForLevel(level, this.finished));
    this.sodPosition = 1000; // CutScene sets 0 when sod rolls (StartLevelIntro 688-697)
    this.showShovel = hasShovel(level, this.finished);
    this.tutorialState = 0; // TutorialState (ConstEnums.h); L1/L2 pick-up flows set by CutScene end
    this.paused = false; // Board::mPaused (Board.cpp:90) — set by pause menu / dialogs (LawnApp ModalOpen/KillDialog)
    this.cutscene = null; // CutScene:: link back (SHOVEL_COMPLETED resets the intro clock)
    this.tutorialTimer = -1; // mTutorialTimer (Board.cpp:156)
    this.advice = null; this.adviceT = 0; // MessageWidget label + duration
    this.helpShown = {}; this.helpIndex = -1; // mHelpDisplayed + mHelpIndex
    this.tutorialArrow = -1; // TutorialArrowShow packet index (-1 = none)
    this.outOfMoney = 0; // mOutOfMoneyCounter (Board.cpp:1570, 5886): poor-click red blink
    this.plantsShoveled = 0; // Board::mPlantsShoveled (Board.cpp:127): dig count (stats)
    this.packetFlash = {}; // seed -> ticks left of SeedPacketFlash ready-sparkle (FlashIfReady)
    this.cells = [];
    for (let c = 0; c < 9; c++) for (let r = 0; r < this.rows; r++)
      this.cells.push({ col: c, row: r, lily: null, pot: null, base: null, shell: null, grave: false, crater: false });
    this.zombies = []; this.projs = []; this.coins = []; this.lobs = []; this.debris = [];
    this.cutsceneZombies = []; // PlaceStreetZombies display-only (CutScene.cpp:485)
    this.mowers = [];
    // User override (differs from source on purpose): LawnMowerInitialize
    // (LawnMower.cpp:10) sets mPosX=-160, mVisible=TRUE — visible but
    // offscreen at the play framing. During the intro's house/street pans,
    // though, the camera offset (+220) drags that "offscreen" mower ONTO the
    // porch (screen ~60), so it sits by the front door through the cutscene.
    // We init hidden; the cutscene slide branch flips each row visible at its
    // mStart (same -80 -> rest slide as source), and headless boards (no
    // cutscene) are placed ready+visible by the caller. ZombiesWon keeps its
    // play-state visibility (retail behavior, untouched).
    // Retail puts mowers only on non-dirt rows (Board::InitLawnMowers:1642),
    // indexed by row.
    for (let r = 0; r < this.rows; r++) {
      if (this.isDirtRow(r)) { this.mowers.push(null); continue; }
      // Board::InitLawnMowers (1642-1662): roof rows get no mower at all
      // until the roof-cleaner purchase; every other non-dirt row gets one.
      const roofRow = this.bg === BG.ROOF || this.bg === BG.BOSS;
      if (roofRow && !this.hasRoofCleaner) { this.mowers.push(null); continue; }
      // LawnMowerInitialize: pool rows are POOL cleaners only with the shop
      // purchase — otherwise plain lawn mowers (which sink at x>50).
      const pool = !roofRow && this.isWaterRow(r) && this.hasPoolCleaner;
      // LawnMower pool heights (LawnMower.h): LAND / DOWN_TO_POOL / IN_POOL /
      // UP_TO_LAND with mAltitude riding 0 -> -28 in the water.
      this.mowers.push({ row: r, x: -160, y: posYOnRow(this.bg, -120, r) + 15, state: "ready", chomp: 0, body: null, visible: false, height: "land", alt: 0, pool, roof: roofRow });
    }
    // Vasebreaker (Board::InitLawnMowers 1652-1662, explicit L35 condition):
    // adventure 35 gets a mower for ALL 6 rows 0-5 — one more than the
    // 5-row night lawn holds. The 6th rides the dirt strip below (row 5).
    if (this.isVase) {
      this.mowers.push({ row: 5, x: -160, y: posYOnRow(this.bg, -120, 5) + 15, state: "ready", chomp: 0, body: null, visible: false, height: "land", alt: 0, pool: false, roof: false });
    }
    for (const m of this.mowers) this.initMowerBody(m);
    const adv = pickAdventureWaves(level, Math.random, this.finished);
    this.numWaves = adv.numWaves; this.waves = adv.waves;
    // Vasebreaker has no waves at all (Challenge::ScaryPotter — mNumWaves 0,
    // so PlaceStreetZombies previews nothing and the spawner never fires).
    if (this.isVase) { this.numWaves = 0; this.waves = []; }
    this.currentWave = 0;
    // PickRowForNewZombie smooth array (TodSmoothArray per row) + mower
    // memory (mWaveRowGotLawnMowered init -100, Board.cpp:1410) + ice sheet
    // (mIceTimer/mIceMinX init BOARD_ICE_START=800, Board.cpp:1411).
    this.rowPickingArray = [];
    for (let r = 0; r < this.rows; r++) this.rowPickingArray.push({ item: r, w: 1, last: 0, second: 0 });
    this.waveRowMowed = new Array(this.rows).fill(-100);
    this.iceTimer = new Array(this.rows).fill(0);
    this.iceMinX = new Array(this.rows).fill(800);
    // Zamboni fx (PARTICLE_ZAMBONI_* systems, ticked in updateFx, rendered in
    // the TOP pass) + the per-row ice-sparkle systems (PARTICLE_ICE_SPARKLE,
    // ticked + repositioned in updateIce, rendered at GROUND row+3).
    this.zamFx = [];
    this.iceSpark = new Array(this.rows).fill(null);
    // Plant::IceZombies (Plant.cpp:4249-4257): the 300-tick freeze-all counter
    // (Board::mIceTrapCounter) — pool/sky spawns hold while set (Board 4828/
    // 4921; vacuous in the 1-9 scope, whose spawners are wave/grave-only, but
    // ticked source-exactly below).
    this.iceTrapCounter = 0;
    // Board::InitZombieWaves 1229-1231: first-time L2 countdown doubled —
    // ZOMBIE_COUNTDOWN*2 = 5000, else ZOMBIE_COUNTDOWN_FIRST_WAVE = 1800.
    // Whack-a-mole overrides to 200 via Challenge::StartLevel (411-416).
    this.zombieCd = (this.isWhack || this.isVase) ? 200 : (this.firstTime && level === 2) ? WAVE_GAP * 2 : WAVE_FIRST;
    this.zombieCdStart = this.zombieCd; this.waveHealthStart = 0; this.healthToNext = -1; // mZombieHealthWaveStart = 0, mZombieHealthToNextWave = -1 (InitZombieWaves)
    if (this.isWhack) this.challengeCounter = 0;
    // Vasebreaker challenge state (Challenge::ScaryPotter*): the vases on
    // the lawn, the 0-2 stage index, the intermission countdown (0 = idle),
    // the pending main-side Dave cue (consumed by main.js), whether Dave is
    // currently up (set by main.js each tick before update), the active
    // hammer swing, and the break-effect systems (ticked in updateFx).
    this.vases = [];
    this.vaseStarted = false;
    this.survivalStage = 0;
    this.nextSurvivalStage = 0;
    this.vaseDaveCue = -1;
    this.daveActive = false;
    this.mallet = null;
    this.vaseStrips = [];
    this.vaseChunks = [];
    // Last broken vase, GRID coords (award fallback; OpenPot keeps it fresh).
    this.vaseLastC = 4; this.vaseLastR = 2;
    this.heldUsable = null; // cursor-held usable-seed coin (sim-side link; G.selUsable mirrors it)
    // Challenge ctor (387-390): pots exist from level init (visible during
    // the intro pan). The sticky advice is NOT set here — Challenge::
    // StartLevel (446-449) runs via Board::StartLevel (1688) via
    // LawnApp::StartPlaying (434) at the intro→play handoff, so the
    // USE_SHOVEL bar never shows during the Dave cutscene.
    if (this.isVase) {
      this.vasePopulate(0);
      this.vaseStarted = true;
    }
    this.hugeCd = 0; this.finalSfxCd = 0;
    // Board::DrawProgressMeter/UpdateProgressMeter (Board.cpp): meter fill 0..150
    // + flag-raise anim counter.
    this.progressW = 0; this.flagRaise = 0;
    // Board::InitLevel 1396-1403: L1 first-time starts with 150 sun, else 50.
    // Whack-a-mole starts at 0 (Board.cpp:1384: beghouled/scary/whack gate).
    this.sun = (this.isWhack || this.isVase) ? 0 : (this.firstTime && level === 1) ? 150 : 50;
    this.sunFallen = 0;
    this.money = 0; this.sunCd = SUN_FIRST_DROP + Math.floor(Math.random() * (SUN_DROP_RANGE + 1)); // Board::InitLevel day init: RandRangeInt(425, 700)
    this.tick = 0; // mMainCounter: per-tick board clock (floating bob, graves)
    this.recharge = {};
    this.state = "intro"; this.introT = 260;
   this.shake = 0; this.flashes = []; this.dirt = []; this.squashDust = []; this.splats = []; this.beams = []; this.bursts = []; this.husks = [];
    // Digger fx (PARTICLE_DIGGER_TUNNEL follow-motes + PARTICLE_DIGGER_RISE
    // burst + REANIM_DIGGER_DIRT rise dirt): row-banded PARTICLE systems,
    // transient (never saved) like graveFx.
    this.diggerFx = []; this.diggerDirt = [];
    // Jalapeno fire trail (Board::DoFwoosh/UpdateFwoosh, Board.cpp:0x41D450):
    // the 12 REANIM_JALAPENO_FIRE reanims of the burning row (mFwooshID) +
    // the shared kill-off countdown (mFwooshCountDown = 100). Transient fx —
    // never snapshotted, like flashes/powies.
    this.fwoosh = []; this.fwooshCd = 0;
    // Fire-pea impact flames (Projectile::DoImpact 861-870): one-shot
    // REANIM_JALAPENO_FIRE bursts per splash hit. Transient, never saved.
    this.fireFx = [];
    this.wallnutEats = []; // WallnutEatSmall/Large TodParticle systems (chew + crack-stage bursts)
    this.powies = []; // PARTICLE_POWIE systems (cherry/explode-o-nut blasts)
    // Doom-shroom blast (PARTICLE_DOOM at RENDER_LAYER_TOP, Plant::DoSpecial
    // 4367-4374): the 11-emitter Doom.xml system below (spawnDoom/tickDoomFx),
    // rendered in the TOP pass (doom render block in main.js).
    this.doomFx = [];
    // Ice-shroom fx (Plant::DoSpecial 4411 + Zombie thaw/death 4514/8897, all
    // RENDER_LAYER_TOP): PARTICLE_ICE_TRAP (detonation burst at the plant
    // center) + PARTICLE_ICE_TRAP_RELEASE (thaw/death shard pops at +75/+106,
    // baked at spawn — the victims never move mid-burst). Motor below
    // (spawnIceTrap/spawnIceRelease/tickIceFx), rendered in the TOP pass.
    this.iceFx = [];
    // Whack hammer POW bursts (PARTICLE_POW at RENDER_LAYER_ABOVE_UI,
    // Challenge::MouseDownWhackAZombie 1222): single-mote Pow.xml systems.
    this.pows = [];
    // Pool splash fx (Zombie::PoolSplash 6823 + dolphin/snorkel/tangle/mower
    // water entries): REANIM_SPLASH reanims + PARTICLE_PLANTING_POOL dirt motes
    // (via spawnDirt water), ticked here, drawn in the TOP pass. Transient:
    // not saved (retail fx never persist across saves either).
    this.splashes = [];
    // Mower-kill puffs (MowDown 8563-8564: REANIM_PUFF at -73/-56,
    // renderOrder+2): one-shot reanims, row-banded transient like the husks
    // — ticked + swept in updateFx, drawn in the row pass above the row's
    // debris. Never saved (retail fx never persist across saves either).
    this.puffs = [];
    // PARTICLE_TALL_NUT_BLOCK (dolphin bonk 1834): brief block burst.
    this.tallnutBlocks = [];
    // Pool water state (Board::Update 5917-5926 + PoolEffect.cpp):
    // mPoolEffect->mPoolCounter ticks while a pool/fog stage runs outside
    // the loss walk-in and the ice trap; BACKGROUND_3_POOL additionally runs
    // the looping POOL_SPARKLY system at (450,295) (RENDER_LAYER_GROUND,
    // order 2 — above the water, below the lawn entities). The two sparkle
    // emitters below are decoded from the decomp's raw PoolSparkly.xml
    // (same family as main.zip's compiled PoolSparkly blob); art
    // particles/PoolSparkly.png is byte-identical from main.zip. Counter and
    // motes are cosmetic/transient: never saved (retail doesn't persist them
    // either).
    this.poolCounter = 0; // PoolEffect::mPoolCounter
    this.sparkles = []; // pool glow motes (transient, never saved)
    this.poolAcc = [0, 0]; // per-emitter spawn accumulators (rate is per-second)
    // Fog state (Board ctor + InitLevel 1571-1575): per-cell look/offset rolls,
    // per-cell density, the pixel offset and the blow countdown. The ctor
    // lands directly on the InitLevel values: blown=200 + offset=max
    // (1065-LeftFogColumn()*80). The cutscene roll clamps 200->200 on its
    // first tick past the roll edge, then ticks down (CutScene 1289-1293);
    // nothing resets blown at play start (Board::StartLevel has no fog code
    // — only CancelIntro clears it, and this port has no skip path).
    this.gridCelLook = []; // [9][6] Rand(20): fog cel variant per cell
    this.gridCelOffset = []; // [9][6] Rand(10)-5: jitter (no software-path use — kept for save compat)
    this.gridCelFog = []; // [9][rows+1] cell fog density 0-255 (persisted; look/offset re-roll on load)
    for (let fx = 0; fx < 9; fx++) {
      this.gridCelLook.push(Array.from({ length: 6 }, () => Math.floor(Math.random() * 20)));
      this.gridCelOffset.push(Array.from({ length: 6 }, () => Math.floor(Math.random() * 10) - 5));
      this.gridCelFog.push(new Array(this.rows + 1).fill(0));
    }
    this.fogOffset = 0; // Board::mFogOffset
    this.fogBlown = 0; // Board::mFogBlownCountDown
    if (this.stageHasFog()) {
      this.fogBlown = 200; // InitLevel (Board.cpp, adventure branch)
      this.fogOffset = 1065 - this.leftFogColumn() * 80; // InitLevel 1574
    }
    // Grave systems (GridItem::AddGraveStoneParticles + Zombie::RiseFromGrave
    // land branch + Plant::UpdateGraveBuster): GraveStoneRise roll bursts,
    // ZombieRise (arm + splash + clumps), GRAVE_BUSTER (attached while the
    // buster chews), GRAVE_BUSTER_DIE (clear burst). Ticked in updateFx,
    // rendered in the TOP pass.
    this.graveFx = [];
    // Zombie::RiseFromGrave (Zombie.cpp:8200): the ZombieRise fx + the rising
    // zombie spawn on the SAME tick — the body rides buried (altitude -200)
    // while the arm waves, emerging over the last 50 of its 150 ticks.
    // Potato-mine blast visuals (PARTICLE_POTATO_MINE, DoSpecial 4421): the
    // user's compiled strip mote in potatoBlasts (see potatoBlast()), ticked
    // in updateFx, rendered in the TOP pass below.
    this.potatoBlasts = [];
    // Fume-shroom spray (PARTICLE_FUMECLOUD, UpdateShooting 3245-3249): the
    // user's compiled strip mote in fumeClouds (see spawnFumeCloud()),
    // ticked in updateFx, rendered in the TOP pass below.
    this.fumeClouds = [];
    this.riseCounter = 0; // mRiseFromGraveCounter (set 200 at the final wave)
    this.gravesCleared = 0; // Board::mGravesCleared (UpdateGraveBuster 1114)
    this.endCd = 0;
    this.levelAwardSpawned = false; // Board::mLevelAwardSpawned (TrySpawnLevelAward)
    this.fadeOut = -1; // Board::mBoardFadeOutCounter (FadeOutLevel; -1 inactive)
    this.coinBankT = 0; // Board::mCoinBankFadeCount (ShowCoinBank, default 1000)
    this.scoreNextMower = 0; // Board::mScoreNextMowerCounter (end-sequence mower gold)
    // Conveyor belt (Board::HasConveyorBeltSeedBank 8775, Challenge::InitLevel
    // + StartLevel): in scope L5 (bowling) + L10/L20/L30 (mini-boss). Bank holds 10
    // sliding packets (SeedBank 1007-1156).
    // L5 (IsWallnutBowlingLevel, StartLevel 434-440): seeds one wall-nut,
    // zombieCd 200 + convCd 400 + showBowlingLine; first-time pre-plants 3
    // peashooters via NewPlant (InitLevel 391-396, no cost/effects).
    // L25 Big Trouble Little Zombie (Challenge::StartLevel 450-455): the
    // stormy/bungee branch — zombieCd 200 + convCd 200 with an EMPTY belt
    // (UpdateConveyorBelt feeds it), no pre-plants, no stripe.
    // L10/L20/L30 (IsMiniBossLevel, StartLevel 501-506): zombieCd 100 + convCd 200,
    // empty belt (UpdateConveyorBelt feeds it), no pre-plants, no stripe.
    this.isConveyor = hasConveyorBelt(level);
    this.isBowling = isBowlingLevel(level); // Challenge::CanPlantAt/MouseDownWithPlant bowling-only branches
    this.convPackets = []; // [{seed, offset, born}] in slot order (RemoveSeed shifts)
    this.convBelt = 0; // SeedBank::mConveyorBeltCounter (slide anim)
    this.convCd = 0; // Challenge::mConveyorBeltCounter (next-seed timer)
    this.convLast = -1; // mLastConveyorSeedType
    this.showBowlingLine = false; // Challenge:: line flag (replay L5 starts shown)
    this.bowlers = []; // rolling nuts (Plant::UpdateBowling), not in cells
    this.explodeDef = null; // red-tinted Wallnut atlas clone (lazy)
    if (this.isConveyor) {
      if (this.isBowling) {
        // Replay L5 starts with the line shown (StartLevelIntro 770-771);
        // first-time L5 starts cleared and turns it on at the 2411 advance.
        this.showBowlingLine = !this.firstTime;
        this.convCd = 400;
        this.zombieCd = 200; this.zombieCdStart = 200;
        this.convAddSeed(3);
        if (this.firstTime) {
          this.newPlantFree(5, 1, 0);
          this.newPlantFree(7, 2, 0);
          this.newPlantFree(6, 3, 0);
        }
      } else if (level === 25 || level === 40) {
        // Big Trouble Little Zombie + stormy-night ultimate battle
        // (Challenge::StartLevel 450-455: the shared little-trouble/stormy/
        // bungee/inviso branch).
        this.convCd = 200;
        this.zombieCd = 200; this.zombieCdStart = 200;
      } else {
        // Mini-boss (L10/L20/L30): Challenge::StartLevel 501-506. Belt starts empty.
        this.convCd = 200;
        this.zombieCd = 100; this.zombieCdStart = 100;
      }
    }
    // Board::StageHasGraveStones (Board.cpp:8865): adventure-night only
    // (the bowling/pogo/beghouled/portal/last-stand/IZ/scary-pot/garden/
    // aquarium exclusions never fire in scope; roof/pool/fog return false).
    // Whack-a-mole places its 9 graves via Challenge (Board 1104-1107),
    // not the night tables below.
    if (this.isWhack) this.whackPlaceGraves(9);
    else if (this.stageHasGraveStones()) this.placeGraves();
    // mEnableGraveStones (Board.cpp:93): the cutscene clears it when the
    // grave roll runs (2-1 intro) and sets it at the roll edge + CancelIntro
    // (1011); live default true.
    this.enableGraveStones = true;
  }
  // Challenge::StartLevel (446-449) via Board::StartLevel (1688) via
  // LawnApp::StartPlaying (434): intro→play handoff (NOT level init) — so the
  // USE_SHOVEL advice never shows during the Dave cutscene.
  startLevel() {
    if (this.isVase) {
      this.displayAdvice(ADVICE_TEXT.USE_SHOVEL_ON_POTS, "HINT", "USE_SHOVEL_ON_POTS"); // ScaryPotterStart (adventure branch)
    }
    if (this.isStormy) {
      // Challenge::StartLevel stormy branch (417-421): the lightning
      // machine restarts at FLASH_1/400 on the intro->play handoff (the
      // zombieCd/convCd 200 ride the shared 450-455 branch in the ctor).
      this.stormState = "flash1";
      this.stormCounter = 400;
    }
  }
  // ----- helpers -----
  sfx(n, vol, pitch) { if (this.muted) return; try { this.libs.sfx(n, vol, pitch); } catch (e) { /* headless */ } } // mMuteSoundsForCutscene
  sting() { if (this.muted) return; try { this.libs.sting(); } catch (e) { /* headless */ } } // FOLEY_DANCER one-shot (UpdateZombieDancer 2963)
  rowY(row) { return gridToPixelY(8, row, this.bg); }
  // Board::PixelToGridYKeepOnBoard for a projectile screen-Y: nearest valid
  // row (stars/threepeater drift re-lane as they fly diagonally).
  rowFromY(x, y) {
    const g = pixelToGrid(x, y, this.bg);
    if (g.row >= 0 && g.row < this.rows) return g.row;
    let best = 0, bd = Infinity;
    for (let r = 0; r < this.rows; r++) {
      const d = Math.abs(gridToPixelY(8, r, this.bg) - y);
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  }
  // Projectile::GetProjectileRect (Projectile.cpp:1169): logical 40x40 box
  // (mWidth/mHeight) with per-type X slop. mX/mY are ints of mPosX/mPosY.
  projRect(p) {
    const x = Math.floor(p.x), y = Math.floor(p.y);
    switch (p.type) {
      case "pea": case "snow": return { x: x - 15, y, w: 55, h: 40 };
      // PROJECTILE_FIREBALL (GetProjectileRect 1185-1188): Rect(mX, mY,
      // mWidth-10, mHeight) — narrower than peas, no 15px lead.
      case "fire": return { x, y, w: 30, h: 40 };
      case "melon": return { x: x + 20, y, w: 60, h: 40 };
      case "spike": return { x: x - 25, y, w: 65, h: 40 };
      default: return { x, y, w: 40, h: 40 }; // puff/star/cabbage/kernel/butter
    }
  }
  // Projectile::PeaAboutToHitTorchwood (Projectile.cpp:174): while a straight
  // pea/snow overlaps a torchwood's attack rect shifted +40 (overlap > 10),
  // it cannot collide — the torchwood converts it instead ("card torchwood"
  // comment in the decomp). Fireballs are exempt (already converted).
  peaAboutToHitTorchwood(p) {
    if (p.motion !== "straight") return false;
    if (p.type !== "pea" && p.type !== "snow") return false;
    const pr = this.projRect(p);
    for (const q of this.allPlants()) {
      if (q.dead || q.seed !== 22 || q.row !== p.row || q.sleeping) continue;
      if (p.hitTorchwoodGridX === q.col) continue;
      const ar = Plant.attackRect(22, q.x, q.y, q.w, q.h, 0);
      if (getRectOverlap(ar.x, ar.w, pr.x + 40, pr.w) > 10) return true;
    }
    return false;
  }
  // Projectile::FindCollisionTarget (Projectile.cpp:202): nearest (smallest
  // zombie-rect X) effected zombie in the projectile's row (boss: any row)
  // whose rect overlaps the projectile rect (edge-touching counts, >= 0).
  // Swimming snorkels only catch projectiles riding high (mPosZ > 45); young
  // forward stars pass over digging diggers (age < 25).
  findCollisionTarget(p) {
    if (this.peaAboutToHitTorchwood(p)) return null;
    const pr = this.projRect(p);
    let best = null, bestX = Infinity;
    for (const z of this.zombies) {
      if (z.dead || z.gone || z.mowed) continue;
      if (z.type !== "boss" && z.row !== p.row) continue;
      if (!z.effectedByDamage(p.rangeFlags)) continue;
      if (z.type === "snorkel" && z.swimming && !z.eating && p.z <= 45) continue;
      if (p.type === "star" && p.age < 25 && p.velX >= 0 && z.type === "digger") continue;
      const zr = z.zombieRect();
      if (getRectOverlap(pr.x, pr.w, zr.x, zr.w) < 0) continue;
      if (!best || zr.x < bestX) { best = z; bestX = zr.x; }
    }
    return best;
  }
  // Plant::UpdateTorchwood (Plant.cpp:1376): every torchwood converts each
  // overlapping same-row pea (to fireball, 40 dmg) or snow (melts to pea)
  // at overlap >= 10, once per plant column. Fire peas are exempt (only
  // PEA/SNOWPEA are checked). No motion gate in the source — backwards and
  // threepeater side peas convert too (ConvertToFireball mirrors backwards ones).
  updateTorchwood() {
    for (const q of this.allPlants()) {
      if (q.dead || q.seed !== 22 || q.sleeping) continue;
      const ar = Plant.attackRect(22, q.x, q.y, q.w, q.h, 0);
      for (const p of this.projs) {
        if (p.dead || p.row !== q.row) continue;
        if (p.type !== "pea" && p.type !== "snow") continue;
        if (p.hitTorchwoodGridX === q.col) continue;
        const pr = this.projRect(p);
        if (getRectOverlap(ar.x, ar.w, pr.x, pr.w) < 10) continue;
        if (p.type === "pea") {
          p.type = "fire"; p.dmg = 40; p.fire = true; p.img = this.projImage("fire");
          p.hitTorchwoodGridX = q.col;
          this.attachFirePea(p); // ConvertToFireball (1200): reanim + FOLEY_FIREPEA below
          this.sfx("firepea");
        } else {
          p.type = "pea"; p.dmg = PEA_DMG; p.fire = false; p.img = this.projImage("pea");
          p.hitTorchwoodGridX = q.col;
          this.sfx(this.throwPick()); // ConvertToPea (1225): FOLEY_THROW
        }
      }
    }
  }
  // Projectile::ConvertToFireball (Projectile.cpp:1200): the type flip above
  // plus a looping REANIM_FIRE_PEA at (mPosX-25, mPosY-25), rate Rand(50, 80).
  // Backwards peas (split/leftpeater, MOTION_BACKWARDS) mirror with OverrideScale(-1, 1) and ride +80 X (1212-1216).
  attachFirePea(p) {
    p.fx = null;
    try {
      const back = p.motion === "back";
      const fx = this.makeReanim("FirePea", p.x + (back ? 55 : -25), p.y - 25);
      fx.loopType = LOOP; // AddReanimation default is already LOOP in this port
      fx.animRate = 50 + Math.random() * 30; // RandRangeFloat(50, 80)
      if (back) fx.setScale(-1, 1); // OverrideScale(-1, 1)
      p.fx = fx;
    } catch (e) { /* headless/def missing: the glow stand-in still renders */ }
  }
  // Projectile::IsSplashDamage (Projectile.cpp:374): melons and (non-resistant)
  // fireballs splash; everything else hits one zombie. Fire resistance only
  // cancels the fireball splash (binary-corrected).
  isSplashDamage(p, z) {
    if (p.type === "fire" && z && z.isFireResistant()) return false;
    return p.type === "melon" || p.type === "fire";
  }
  // Projectile::GetDamageFlags (Projectile.cpp:387): splash hits shield AND
  // body; lobbed/backwards/star-backwards bypass the shield; snow freezes.
  // The splash branch is zombie-dependent (fire resistance cancels it).
  projDamageFlags(p, z) {
    let f = 0;
    if (this.isSplashDamage(p, z)) f |= DMG_HITS_BOTH;
    else if (p.motion === "lobbed" || p.motion === "back") f |= DMG_BYPASS;
    else if (p.motion === "star" && p.velX < 0) f |= DMG_BYPASS;
    if (p.type === "snow") f |= DMG_FREEZE;
    return f;
  }
  // Projectile::IsZombieHitBySplash (Projectile.cpp:413): fireball splash is
  // same-row only (boss: row 0) with a 100-wide rect; melon hits ±1 row.
  // Resistant zombies and the uneffected never splash.
  isZombieHitBySplash(p, z) {
    const pr = this.projRect(p);
    const w = p.type === "fire" ? 100 : pr.w;
    const rowDev = z.type === "boss" ? 0 : z.row - p.row;
    const zr = z.zombieRect();
    if (z.isFireResistant() && p.type === "fire") return false;
    if (z.type === "boss") { /* rowDev forced 0 */ }
    if (p.type === "fire") { if (rowDev !== 0) return false; }
    else if (rowDev > 1 || rowDev < -1) return false;
    return z.effectedByDamage(p.rangeFlags) && getRectOverlap(pr.x, w, zr.x, zr.w) >= 0;
  }
  // Projectile::DoSplashDamage (Projectile.cpp:448): the direct victim takes
  // FULL damage; everyone else in the splash takes damage/3, capped so the
  // total splash never exceeds 7x the base (fireball: 1x).
  doSplashDamage(p, direct) {
    let others = 0;
    for (const z of this.zombies) {
      if (z.dead || z.gone || z.mowed || z === direct) continue;
      if (this.isZombieHitBySplash(p, z)) others++;
    }
    const splash0 = Math.floor(p.dmg / 3);
    const maxTotal = p.type === "fire" ? p.dmg : p.dmg * 7;
    let splash = splash0;
    if (splash * others > maxTotal) splash = Math.max(1, Math.floor(p.dmg * maxTotal / (splash * others * 3)));
    // Splash victims are never fire-resistant (IsZombieHitBySplash gates),
    // so the flags are uniformly HITS_SHIELD_AND_BODY (+FREEZE for snow,
    // which never splashes in the 1-9 scope — kept for completeness).
    const flags = DMG_HITS_BOTH | (p.type === "snow" ? DMG_FREEZE : 0);
    for (const z of this.zombies) {
      if (z.dead || z.gone || z.mowed) continue;
      if (!this.isZombieHitBySplash(p, z)) continue;
      z.takeDamage(z === direct ? p.dmg : splash, flags);
    }
  }
  // Projectile::DoImpact (Projectile.cpp:811) for straight-flying shots:
  // impact sfx, fire clears chill, splash or single-target TakeDamage, the
  // fireball impact flame, then the splat particle (pea/snow/puff).
  projImpact(p, z) {
    this.impactSfx(p, z);
    // DoImpact (811-839): RemoveColdEffects fires ONLY in the splash branch
    // (direct victim only — a fire-resistant direct hit keeps its chill) and
    // the impact flame only on splash hits.
    if (p.type === "fire" && z && this.isSplashDamage(p, z)) {
      z.removeColdEffects(); // RemoveColdEffects (819)
      this.spawnFireBurst(p);
    }
    if (this.isSplashDamage(p, z)) this.doSplashDamage(p, z);
    else if (z) z.takeDamage(p.dmg, this.projDamageFlags(p, z));
    if ((p.type === "pea" || p.type === "snow") && z) this.peaSplat(p, z);
    else if (p.type === "puff" && z) this.puffSplat(p, z);
    else if (p.type === "star" && z) this.starSplat(p, z); // PARTICLE_STAR_SPLAT (DoImpact 872-873)
  }
  spawnFireBurst(p) {
    try {
      const fx = this.makeReanim("fire", p.x + 38, p.y - 20);
      // DoImpact 861-870: one-shot REANIM_JALAPENO_FIRE at (mPosX+38,
      // mPosY-20, renderOrder+1), rate 24, OverrideScale(0.7, 0.4), born
      // PLAY_ONCE (the AddReanimation birth default; our ctor defaults to
      // LOOP so it is set explicitly). Source plays the raw timeline, but
      // main.zip's build restructured the reanim around loop ranges: frames
      // 0-7 (anim_flame) are the dense wall flame, 8-13 (anim_done) its
      // shrink-fade, 14-27 an unrelated offset FIREPEA section, 28-69 empty.
      // So the burst plays frames 0-13 once (~58 ticks @24fps): full flame
      // that dies away, centered on the impact — no offset section, no dead
      // tail. (A bare full-timeline play from 0.25 shows sparse detached
      // bits then ~180 ticks of nothing; an anim_flame-only play pops out
      // with no fade.)
      fx.frameStart = 0; // first flame frame (SetFramesForLayer would crop to
      fx.frameCount = 14; // one range; the burst needs flame + fade together)
      fx.loopType = PLAY_ONCE; // Reanimation::Reanimation births PLAY_ONCE
      fx.loopCount = 0;
      fx.animTime = 0;
      fx.animRate = 24;
      fx.setScale(0.7, 0.4); // OverrideScale(0.7, 0.4)
      this.fireFx.push({ body: fx, row: p.row });
    } catch (e) { /* headless/def missing: the damage still applies */ }
  }
  // Pool rows are 2-3 of 6 (Board::PickBackground: PLANTROW_POOL on rows 2,3
  // for POOL/FOG; InitLevel maps those to GRIDSQUARE_POOL). Dual-arity so a
  // (col,row) call can't silently read the column as the lane.
  isWaterRow(c, r) { const row = r === undefined ? c : r; return (this.bg === BG.POOL || this.bg === BG.FOG) && (row === 2 || row === 3); }
  // Board::IsPoolSquare (Board.cpp:2066): GRIDSQUARE_POOL squares are pool
  // rows 2-3, cols 0-8 (Board::InitLevel 1053-1086).
  isPoolSquare(c, r) { return c >= 0 && c <= 8 && this.isWaterRow(r); }
  // Board::PixelToGridX (mX+75 style sample points in CheckForPool 6863).
  pixelToGridCol(x) { return Math.floor((x - lawnXMin(this.bg)) / cellW(this.bg)); }
  // Board-side half of Zombie::PoolSplash (Zombie.cpp:6823): the REANIM_SPLASH
  // reanim at the (already offset) burst point + the PARTICLE_PLANTING_POOL
  // puff. Generic PoolSplash offsets the puff (+37,+42) from the burst; the
  // tangle-kill (Plant.cpp:1242) and mower (LawnMower.cpp:68) bursts carry
  // their own particle anchors, passed as pdx/pdy. The foley pick rides on
  // the caller (ZOMBIESPLASH coming in, PLANT_WATER going out).
  poolSplash(x, y, sx, sy, pdx = 37, pdy = 42) {
    try {
      const r = this.makeReanim("splash", x, y);
      r.setScale(sx, sy);
      // Reanimation ctor defaults to PLAY_ONCE (Reanimator.cpp:471920) and
      // PoolSplash never overrides it — the burst plays its full 17-frame
      // timeline (~141 ticks) and dies on its own. It must still be up while
      // the 50-tick pool riser surfaces, obscuring the emergence.
      r.loopType = PLAY_ONCE;
      this.splashes.push({ reanim: r });
    } catch (e) { /* headless/def missing: dirt mote still fires */ }
    this.spawnDirt(x + pdx, y + pdy, true);
  }
  // PARTICLE_TALL_NUT_BLOCK (TallNutBlock.xml, pole 1702 / pogo 1422 /
  // dolphin 1834): tall-nut bonk burst at the plant. Main.zip art only
  // (IMAGE_STAR40 = particles/Star40.png): 6 motes, ring-spawn radius
  // [10 50], constant launch speed 100x0.01, fixed 20-tick life, sysDur 200,
  // scale [0.2 0.4], yellow tint (1, 0.9, 0), spin ±1400, no gravity /
  // friction (both Friction tracks are 0), particle alpha hold-1-to-40% then
  // fade, system alpha hold-1-to-80% then fade, normal blend.
  spawnTallnutBlock(x, y) {
    const motes = [];
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2, rad = 10 + Math.random() * 40;
      const la = Math.random() * Math.PI * 2, sp = 100 * 0.01;
      motes.push({
        x: x + Math.sin(a) * rad, y: y + Math.cos(a) * rad,
        vx: Math.sin(la) * sp, vy: Math.cos(la) * sp,
        rot: Math.random() * Math.PI * 2,
        spinVel: (Math.random() * 2 - 1) * 1400 * 0.01 * Math.PI / 180,
        sc: 0.2 + Math.random() * 0.2,
        age: 0, dur: 20,
      });
    }
    this.tallnutBlocks.push({ x, y, age: 0, dur: 200, motes });
  }
  stageIsNight() { return this.bg === BG.NIGHT || this.bg === BG.FOG || this.bg === BG.BOSS; }
  stageHasFog() { return !this.isStormy && this.bg === BG.FOG; }
  // Board::LeftFogColumn (Board.cpp, adventure scope): the leftmost fogged
  // column — L31: 6, L32-36: 5, L37-40: 4. Non-adventure returns 5, air-raid
  // 6 (both out of scope); an adventure level outside 31-40 hits the retail
  // TOD_ASSERT — the port falls back to 5.
  leftFogColumn() {
    if (this.level === 31) return 6;
    if (this.level >= 32 && this.level <= 36) return 5;
    if (this.level >= 37 && this.level <= 40) return 4;
    return 5;
  }
  // Board::UpdateGame fog-offset animation (Board.cpp:5780-5795). Runs every
  // scene (intro + play) while fogBlown > 0 — the offset eases max->0 as the
  // fog rolls in from the right. isIntro selects the SCENE_LEVEL_INTRO
  // branch; the blown>=2000 branch is the post-blover recovery drift.
  updateFogOffset(isIntro) {
    if (!this.stageHasFog() || this.fogBlown <= 0) return;
    const max = 1065 - this.leftFogColumn() * 80;
    if (isIntro) {
      this.fogOffset = todAnimateCurveFloat(200, 0, this.fogBlown, max, 0, "easeOut");
    } else if (this.fogBlown < 2000) {
      this.fogOffset = todAnimateCurveFloat(2000, 0, this.fogBlown, max, 0, "easeOut");
    } else if (this.fogOffset < max) {
      this.fogOffset = todAnimateCurveFloat(-5, max, this.fogOffset * 1.1, 0, max);
    }
  }
  // Board::ClearFogAroundPlant (Board.cpp:7428): fades a diamond of cells
  // around the plant. Plantern clears size 4 with a corner notch (dx>3 or
  // dy>2 skips; dx+dy==5 skips); torchwood clears size 1 (dx+dy>size skips).
  // offX = (fogOffset+50)/100 (int division): the clear window tracks the
  // rolling offset. Fade-out speeds: 6 idle, 2 while rolling (0<blown<2000),
  // 40 while blown.
  clearFogAroundPlant(p, size) {
    const blown = this.fogBlown;
    const speed = blown > 0 && blown < 2000 ? 2 : blown > 0 ? 40 : 6;
    const left = this.leftFogColumn();
    const offX = Math.floor((this.fogOffset + 50) / 100);
    const x0 = Math.max(p.col - size - offX, left), x1 = Math.min(p.col + size - offX, 8);
    const y0 = Math.max(p.row - size, 0), y1 = Math.min(p.row + size, this.rows);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const dx = Math.abs(x + offX - p.col), dy = Math.abs(y - p.row);
        if (size === 4) {
          if (dx > 3 || dy > 2) continue;
          if (dx + dy === 5) continue;
        } else if (dx + dy > size) continue;
        this.gridCelFog[x][y] = Math.max(this.gridCelFog[x][y] - speed, 0);
      }
    }
  }
  // Plant::NotOnGround (Plant.cpp) for the fog pass: squash mid-leap
  // (RISING/FALLING/DONE = port "rising"/"falling"/"done"), squished, or dead
  // plants don't clear fog. (Bungee riders are out of scope — no plant bungee
  // state exists in this port.)
  fogPlantOnGround(p) {
    if (p.dead || p.squished) return false;
    if (p.seed === 17 && (p.state === "rising" || p.state === "falling" || p.state === "done")) return false;
    return true;
  }
  // Board::UpdateFog (Board.cpp:7482): every scene (intro + play). Cells fade
  // in (3 idle, 1 while rolling, 20 while blown) up to the cap (200 at the
  // left fog column, 255 elsewhere); awake planterns + torchwoods clear
  // around themselves. Sleeping planterns still clear (no sleep gate in
  // source — only NotOnGround skips).
  updateFog() {
    if (!this.stageHasFog()) return;
    const blown = this.fogBlown;
    const fadeIn = blown > 0 && blown < 2000 ? 1 : blown > 0 ? 20 : 3;
    const left = this.leftFogColumn();
    for (let x = left; x < 9; x++) {
      const cap = x === left ? 200 : 255;
      const col = this.gridCelFog[x];
      for (let y = 0; y <= this.rows; y++) col[y] = Math.min(col[y] + fadeIn, cap);
    }
    for (const p of this.allPlants()) {
      if (!this.fogPlantOnGround(p)) continue;
      if (p.seed === 25) this.clearFogAroundPlant(p, 4);
      else if (p.seed === 22) this.clearFogAroundPlant(p, 1);
    }
  }
  // CutScene::Update fog roll (CutScene.cpp:1284-1295) + the per-tick intro
  // fog drivers. While blown > 0 and the cutscene clock has passed the roll
  // edge (TimeFogRollIn 5950 + sod + grave + dave): clamp blown to 200, then
  // tick it down. The offset easing + density update run every intro tick
  // (UpdateGame 5780 + UpdateFog run in every scene).
  updateFogIntro(time, sodTime, graveTime, daveTime) {
    if (!this.stageHasFog()) return;
    if (this.fogBlown > 0 && time > 5950 + sodTime + graveTime + daveTime) {
      if (this.fogBlown > 200) this.fogBlown = 200;
      this.fogBlown--;
    }
    this.updateFogOffset(true);
    this.updateFog();
  }
  stageHasRoof() { return this.bg === BG.ROOF || this.bg === BG.BOSS; }
  // Board::HasLevelAwardDropped (Board.cpp:5305): mLevelAwardSpawned ||
  // mNextSurvivalStageCounter > 0 || mBoardFadeOutCounter >= 0. (No survival
  // stages in the 1-9 adventure scope, so that clause is dropped.) Gates sky
  // sun (5314), zombie spawning (5391), and all plant production (Plant 999).
  hasLevelAwardDropped() { return this.levelAwardSpawned || this.fadeOut >= 0 || this.nextSurvivalStage > 0; }
  // Board::SeedNotRecommendedForLevel (Board.cpp 0x41CC60): bitmask of
  // NOT_RECOMMENDED_* reasons (ConstEnums.h: NOCTURNAL=0, NEEDS_POOL=1,
  // NEEDS_GRAVES=2, NEEDS_FOG=3, NEEDS_ROOF=4, ON_ROOF=5, FOR_CHALLENGE=6,
  // AT_NIGHT=7) — the chooser draws these packets greyed. (Spikerock-on-roof
  // clause omitted: spikerock is out of the 1-9 scope.)
  seedNotRecommended(seed) {
    let r = 0;
    if (Plant.isNocturnal(seed) && !this.stageIsNight()) r |= 1;
    if (seed === 35 && this.stageIsNight()) r |= 128; // coffee at night
    if (seed === 11 && !this.hasGraves()) r |= 4; // gravebuster w/o graves
    if (seed === 25 && !this.stageHasFog()) r |= 8; // plantern w/o fog
   if (seed === 33 && !this.stageHasRoof()) r |= 16; // pot w/o roof
    if (seed === 21 && this.stageHasRoof()) r |= 32; // spikeweed on roof (Board.cpp:9407; spikerock out of scope)
   if (!this.stageHasPool() && Plant.isAquatic(seed)) r |= 2; // aquatics w/o pool
    return r;
  }
  cell(c, r) { return (c < 0 || c > 8 || r < 0 || r >= this.rows) ? null : this.cells[c * this.rows + r]; }
  allPlants() {
    const out = [];
    for (const c of this.cells) for (const k of ["lily", "pot", "base", "shell", "flying"]) if (c[k] && !c[k].dead) out.push(c[k]);
    return out;
  }
  biteTargets(row) {
    // Board::GetPlantsOnLawn (Board.cpp:2185): EMPTY on Wall-nut Bowling
    // (unless the out-of-scope shovel tutorial) — zombies target nothing:
    // they walk past the pre-planted peas and the rollers alike. L10 is a
    // conveyor too but plants normally there, so zombies MUST eat — the
    // gate is bowling-only, not conveyor-wide.
    if (this.isBowling) return [];
    const out = [];
    for (let c = 0; c < 9; c++) {
      const cell = this.cell(c, row);
      if (!cell) continue;
      if (cell.shell && !cell.shell.dead) out.push(cell.shell);
      if (cell.base && !cell.base.dead) out.push(cell.base);
      if (cell.lily && !cell.lily.dead) out.push(cell.lily);
      if (cell.pot && !cell.pot.dead) out.push(cell.pot);
    }
    return out;
  }
  topPlant(c, r) {
    const cell = this.cell(c, r);
    if (!cell) return null;
    return cell.shell || cell.base || cell.lily || cell.pot;
  }
  makeReanim(name, x, y) {
    const def = this.libs.getReanim(name);
    return new Reanimation(def, x, y);
  }
  projImage(type) {
    const map = { pea: "ProjectilePea.png", fire: "ProjectilePea.png", snow: "ProjectileSnowPea.png", puff: "particles/PuffShroom_puff1.png", spike: "ProjectileCactus.png", star: "Projectile_star.png", cabbage: "ProjectileCabbage.png", kernel: "ProjectilePea.png", butter: "ProjectilePea.png", melon: "ProjectilePea.png" };
    return this.libs.images[map[type] || "ProjectilePea.png"] || null;
  }
  isFlagWave(w) { return isFlagWave(w, this.numWaves, this.level, this.finished); }
  // ----- setup -----
  // Board::StageHasGraveStones (Board.cpp:8865) in adventure scope.
  // Vasebreaker is excluded like the other special modes (8865-8878).
  stageHasGraveStones() { return this.bg === BG.NIGHT && !this.isVase; }
  // Board::InitLevel grave tables (Board.cpp:1096-1161, adventure-night):
  // L11-13 cols 6,7,8 -> 1,1,2; L14/16 cols 5-8 -> 1,1,2,3; L17-19 cols 4-8
  // -> 1,2,2,3,3; L20+ cols 3-8 -> 1,2,2,2,3,3. (Grave-danger/whack-a-mole/
  // survival rows are out of scope.) Each stone: counter -Rand(50) (rises
  // in during play via UpdateGridItems), look Rand(20) (picks the art cel),
  // plus one uniform special pick (PickSpecialGraveStone).
  // USER OVERRIDE: retail also rolls mGridCelOffsetX/Y = Rand(10)-5 per
  // grave, but the renderer centers every stone on its true pixels instead
  // (see DrawGraveStone note in main.js), so the jitter is not generated —
  // offX/offY stay 0 (fields kept for save compat).
  placeGraves() {
    const lv = this.level;
    // The source chain (1096-1159) matches 11-13, 14/16, 17-19, 20+ and
    // TOD_ASSERTs otherwise — L15 places no graves in retail (release
    // no-op), so a null table places nothing here too.
    let table = null;
    if (lv >= 11 && lv <= 13) table = [[6, 1], [7, 1], [8, 2]];
    else if (lv === 14 || lv === 16) table = [[5, 1], [6, 1], [7, 2], [8, 3]];
    else if (lv >= 17 && lv <= 19) table = [[4, 1], [5, 2], [6, 2], [7, 3], [8, 3]];
    else if (lv >= 20) table = [[3, 1], [4, 2], [5, 2], [6, 2], [7, 3], [8, 3]];
    if (!table) return;
    for (const [col, n] of table) this.addGraveStones(col, n);
    // PickSpecialGraveStone (Board.cpp:4804): one uniform pick flagged.
    const graves = this.cells.filter((c) => c.grave);
    if (graves.length) graves[Math.floor(Math.random() * graves.length)].grave.special = true;
  }
  // Board::AddGraveStones (Board.cpp:479): fill up to n stones in the column
  // (capped by available cells), each via loose random rolls; Board::
  // AddAGraveStone (467): counter -Rand(50), GRAVE_STONE row+3 render order.
  addGraveStones(col, n) {
    let avail = 0;
    for (let r = 0; r < this.rows; r++) if (this.canAddGraveStoneAt(col, r)) avail++;
    n = Math.min(n, avail);
    let i = 0, guard = 200;
    while (i < n && guard-- > 0) {
      const r = Math.floor(Math.random() * this.rows);
      if (!this.canAddGraveStoneAt(col, r)) continue;
      const cell = this.cell(col, r);
      cell.grave = {
        counter: -Math.floor(Math.random() * 50),
        look: Math.floor(Math.random() * 20),
        offX: 0, // USER OVERRIDE: retail jitters +-5; stones render centered (see note above)
        offY: 0,
        special: false,
      };
      i++;
    }
  }
  // Board::CanAddGraveStoneAt (Board.cpp:419): grass/high-ground squares
  // only, and no grave/crater/ladder already on the cell.
  canAddGraveStoneAt(c, r) {
    const cell = this.cell(c, r);
    if (!cell || cell.grave || cell.crater) return false;
    if (this.isDirtRow(r)) return false;
    return true;
  }
  // CutScene::AddFlowerPots (CutScene.cpp:1047-1081): pre-potted back
  // columns via Board::NewPlant (no cost/effects/sfx — the pot-slot twin of
  // newPlantFree, which only fills cell.base). L41 -> 5, L42 -> 4, L43-50 ->
  // 3, COLUMN mode -> 8 (no such mode in scope), other roof -> 3.
  // Called by the cutscene at the pan-left start for scrolling chooser levels
  // (PlaceLawnItems, CutScene 1258) — NOT at level init, so the lawn is bare
  // through the house shot, street pan and seed choosing. The headless
  // newBoard harness (main.js) calls this directly: its boards are post-handoff.
  addFlowerPots() {
    const lv = this.level;
    let cols = 0;
    if (lv === 41) cols = 5;
    else if (lv === 42) cols = 4;
    else if (lv >= 43 && lv <= 50) cols = 3;
    else if (this.stageHasRoof()) cols = 3;
    for (let x = 0; x < cols; x++) {
      for (let y = 0; y < this.rows; y++) {
        if (!this.canPlant(x, y, 33, true)) continue;
        const cell = this.cell(x, y);
        cell.pot = new Plant(this, 33, x, y);
      }
    }
  }
  // Board::StageHasZombieWalkInFromRight (Board.cpp:8898): whack, vase
  // (scary-potter), zen/tree/aquarium, IZ, squirrel, final boss and the
  // ice minigame walk in from elsewhere. Adventure scope only ever hits
  // whack (L15), vase (L35) and the boss (L50) — the rest are documented
  // no-ops.
  stageHasZombieWalkInFromRight() {
    if (this.isWhack || this.isVase) return false; // whack-a-mole, scary-potter
    if (this.level === 50) return false; // final boss (IsFinalBossLevel)
    return true;
  }
  // Board::PlaceRake (Board.cpp:1590-1639): the shop rake (RAKE 24) drops
  // at col 7 on one normal row (row 5 never, dirt/pool rows never —
  // mPlantRow[row] == PLANTROW_NORMAL), then the purchase ticks down (3
  // levels per buy). Vasebreaker shifts col left of the leftmost vase
  // (col-1 per vase at col <= 7); non-right-walkers (whack/vase/boss in
  // scope) place nothing.
  placeRake() {
    // Single-slot guard (retail has none, but it is unreachable in the
    // retail flow: level-start placement is once-per-board and every vase
    // intermission follows the full grid-item wipe in puzzleNextStageClear).
    if ((this.rakeLeft | 0) <= 0 || this.rake) return false;
    let gx = 7;
    if (this.isVase) {
      for (const v of this.vases) {
        if (v.col <= gx && v.col > 0) gx = v.col - 1;
      }
    } else {
      if (!this.stageHasZombieWalkInFromRight()) return false;
      // Beghouled/bobsled game modes never occur in adventure scope.
    }
    const rows = [];
    for (let r = 0; r < this.rows; r++) {
      if (r === 5) continue; // aRow != 5 (Board.cpp:1618)
      if (this.isDirtRow(r) || this.isWaterRow(r)) continue; // PLANTROW_NORMAL only
      rows.push(r);
    }
    if (!rows.length) return false;
    const gy = rows[Math.floor(Math.random() * rows.length)];
    this.rakeLeft--;
    const x = gridToPixelX(gx, this.bg), y = gridToPixelY(gx, gy, this.bg);
    let body = null;
    try {
      // Board::CreateRakeReanim (1580-1587): (x+20, y), rate 0,
      // PLAY_ONCE_AND_HOLD, attachment.
      body = this.makeReanim("Rake", x + 20, y);
      body.animRate = 0;
      body.loopType = PLAY_ONCE_AND_HOLD;
    } catch (e) { body = null; }
    this.rake = { col: gx, row: gy, x, y, state: "attracting", counter: 0, body };
    if (this.onRakePlaced) { try { this.onRakePlaced(this.rakeLeft); } catch (e) { /* ignore */ } }
    return true;
  }
  getRake() { return this.rake; } // Board::GetRake (Board.cpp:375)
  // GridItem::RakeFindZombie (GridItem.cpp:610-628): same-row, hittable
  // (EffectedByDamage 1U) zombie whose rect touches the (x, y, 63, 80)
  // rake rect (edge-touching counts). Sled teams never trigger
  // (IsBobsledTeamWithSled: leader + followers all ride).
  rakeFindZombie() {
    const rk = this.rake;
    if (!rk) return null;
    for (const z of this.zombies) {
      if (z.dead || z.gone || z.mowed) continue;
      if (z.row !== rk.row) continue;
      if (z.type === "bobsled" && z.bobsledPosition() !== -1) continue;
      if (!z.effectedByDamage(1)) continue; // DR_GROUND (ConstEnums.h 234)
      const zr = z.zombieRect();
      const ox = Math.min(rk.x + 63, zr.x + zr.w) - Math.max(rk.x, zr.x);
      const oy = Math.min(rk.y + 80, zr.y + zr.h) - Math.max(rk.y, zr.y);
      if (ox >= 0 && oy >= 0) return z;
    }
    return null;
  }
  // GridItem::UpdateRake (GridItem.cpp:631-662): first touch swings the
  // rake (rate 20, FOLEY_SWING, 200-tick fuse); at reanim time 0.8 the
  // trapped zombie takes 1800 damage with FOLEY_BONK; at 0 the grid item
  // dies (GridItemDie: reanim dies, item cleared). No rake particles exist
  // in source — the kill runs the victim's normal TakeDamage/death fx.
  updateRake() {
    const rk = this.rake;
    if (!rk) return;
    if (rk.state === "attracting" || rk.state === "waiting") {
      if (this.rakeFindZombie()) {
        if (rk.body) rk.body.animRate = 20;
        rk.counter = 200; // mGridItemCounter
        rk.state = "triggered";
        this.sfx("swing"); // FOLEY_SWING
      }
    } else if (rk.state === "triggered") {
      if (rk.body && rk.body.shouldTriggerTimedEvent(0.8)) {
        const z = this.rakeFindZombie();
        if (z) {
          z.takeDamage(1800, 0); // TakeDamage(1800, 0U)
          this.sfx("bonk"); // FOLEY_BONK
        }
      }
      if (--rk.counter <= 0) {
        // GridItem::GridItemDie (GridItem.cpp:45): reanim dies, item gone.
        if (rk.body) { try { rk.body.dead = true; } catch (e) { /* ignore */ } }
        this.rake = null;
      }
    }
  }
  // Challenge::WhackAZombiePlaceGraves (Challenge.cpp:2748-2789): cols 3-8
  // all rows, weight 1 on planted cells else 100000, kill plants on chosen
  // cells, zero the pick weight after each pick, count clamped to availability.
  whackPlaceGraves(n) {
    const picks = [];
    for (let c = 3; c < 9; c++) for (let r = 0; r < this.rows; r++) {
      if (!this.canAddGraveStoneAt(c, r)) continue;
      const top = this.topPlant(c, r);
      picks.push({ c, r, w: top ? 1 : 100000 });
    }
    if (!picks.length || n <= 0) return;
    n = Math.min(n, picks.length);
    for (let i = 0; i < n; i++) {
      let total = 0;
      for (const p of picks) total += p.w;
      let roll = Math.random() * total, sel = picks[0];
      for (const p of picks) { roll -= p.w; if (roll <= 0) { sel = p; break; } }
      // Kill plants on the chosen cell (IteratePlants Die).
      const cell = this.cell(sel.c, sel.r);
      if (cell) for (const k of ["lily", "pot", "base", "shell"]) {
        if (cell[k] && !cell[k].dead) cell[k].dead = true;
      }
      cell.grave = {
        counter: -Math.floor(Math.random() * 50),
        look: Math.floor(Math.random() * 20),
        offX: 0, // USER OVERRIDE: retail jitters +-5; stones render centered (see placeGraves note)
        offY: 0,
        special: false,
      };
      sel.w = 0;
    }
    // PickSpecialGraveStone still runs on the whack board (Board 1161).
    const graves = this.cells.filter((c) => c.grave);
    if (graves.length) graves[Math.floor(Math.random() * graves.length)].grave.special = true;
  }
  // Board::UpdateGridItems (Board.cpp:9675): every play tick, ripe-able
  // gravestones count 0->100 while mEnableGraveStones (they start negative
  // and rise in during early play). Craters count down on SCENE_PLAYING
  // ticks only (GridItemDie at 0, re-plantable after).
  updateGridItems() {
    for (const c of this.cells) {
      if (this.enableGraveStones && c.grave && c.grave.counter < 100) c.grave.counter++;
      if (c.crater && this.state === "play") {
        if (--c.crater <= 0) c.crater = 0;
      }
    }
    // Garden rake (GridItem::UpdateRake, GridItem.cpp:631-662): the reanim
    // rides the frame clock here (mowers tick the same way in updateMower),
    // then the state machine below runs.
    if (this.rake && this.rake.body) { try { this.rake.body.update(); } catch (e) { /* headless */ } }
    this.updateRake();
  }
  fixedBank() {
    // Board::InitLevel whack branch (1545-1551): 3 fixed packets
    // POTATOMINE/GRAVEBUSTER/CHERRYBOMB, not SeedType 0..2.
    if (this.isWhack) return whackBank();
    // Board::InitLevel vase branch (1540-1544): 1 fixed CHERRYBOMB packet.
    if (this.isVase) return vaseBank();
    // Board::InitLevel 1557-1565: packets = SeedType i for i < GetNumSeedsInBank().
    const n = numSeedsInBank(this.level, this.finished, this.packetUpgrade);
    return Array.from({ length: n }, (_, i) => i);
  }
  slots() { return numSeedsInBank(this.level, this.finished, this.packetUpgrade); }
  // ----- mid-level save (Board::TryToSaveGame -> LawnSaveGame/SyncBoard) -----
  // LawnSaveGame serializes the whole board (scalars from mPaused on, zombies,
  // plants, projectiles, coins, mowers, grid items, particles, reanims, trails,
  // cursor, advice MessageWidget, seedbank, challenge waves, music). The port
  // snapshots the same GAMEPLAY categories as JSON (particle/reanim internals
  // re-derive on load instead of serializing; transient FX — debris, bursts,
  // splats, flashes, powies, fume/potato/grave systems, blink overlays,
  // in-flight shooting poses, the "?" surprise — expire within ~100 ticks and
  // are dropped, noted). bank (the live SeedBank packet list) is G-side state
  // passed in by the caller. Only ever taken while state === "play"
  // (NeedSaveGame's SCENE_PLAYING gate — see boardNeedSaveGame in main.js).
  saveGame(bank) {
    const plantSnap = (p) => ({
      seed: p.seed, col: p.col, row: p.row, hp: p.hp,
      onBungee: p.onBungee || "none", // bungee grab/lift state (steal targets resolve in the zombie loop below)
      state: p.state, stateCd: p.stateCd, launchCd: p.launchCd, fuse: p.fuse,
      chewCd: p.chewCd, produceCd: p.produceCd, wakeUpCd: p.wakeUpCd,
      sleeping: !!p.sleeping, idleRate: p.idleRate, blinkCd: p.blinkCd,
      done: !!p.done, dieCd: p.dieCd, ending: !!p.ending, endingT: p.endingT,
      // Magnet steal flight (mMagnetItems[0] data; the canvas rebuilds on
      // load from the victim-type atlas).
      magnet: p.seed === 31 && p.magnetItem ? { t: p.magnetItem.type, x: p.magnetItem.x, y: p.magnetItem.y, dx: p.magnetItem.dx, dy: p.magnetItem.dy } : null,
      targ: (p.seed === 19 && p.targetZombie && !p.targetZombie.dead && !p.targetZombie.gone && p.targetZombie.saveIdx >= 0) ? p.targetZombie.saveIdx : -1,
      // Squash mid-flight (UpdateSquash 1487-1620): the body rides mX/mY off
      // the grid, so x/y + the whole leap snapshot persist (mTargetX,
      // origin, destY, the KeepOnBoard landing col, the mTargetZombieID
      // index). The HOLD pose re-derives on load; the PARTICLE band flag
      // re-derives from the state.
      sq: p.seed === 17 ? {
        x: p.x, y: p.y, targetX: p.targetX, ox: p.ox, oy: p.oy,
        destY: p.destY, targetCol: p.targetCol,
        targ: (p.sqTarget && !p.sqTarget.dead && !p.sqTarget.gone && p.sqTarget.saveIdx >= 0) ? p.sqTarget.saveIdx : -1,
      } : null,
    });
    // Zombie indices first: grabbing tangle kelps snapshot their victim.
    this.zombies.forEach((z, i) => { z.saveIdx = i; });
    const cells = [];
    for (const c of this.cells) {
      if (!c.lily && !c.pot && !c.base && !c.shell && !c.grave && !c.crater) continue;
      const e = { c: c.col, r: c.row, grave: c.grave || false, crater: c.crater || 0 };
      for (const k of ["lily", "pot", "base", "shell"]) if (c[k] && !c[k].dead) e[k] = plantSnap(c[k]);
      cells.push(e);
    }
    const zombies = [];
    for (const z of this.zombies) {
      // Dying/falling corpses, mowed drivers, bungee-held payloads and the
      // bungee carriers themselves are NOT skipped (only their held payloads
      // are — the carrier persists and re-dives solo, documented): corpses
      // are transient (gone within seconds, loot already dropped) — retail
      // keeps them in the byte blob, the port drops them rather than
      // fake-posing.
      if (z.dead || z.gone || z.mowed || z.held || z.carrier) continue;
        zombies.push({
        type: z.type, row: z.row, x: z.x, y: z.y, wave: z.wave,
        hp: z.hp, helm: z.helm, shield: z.shield, paper: z.paper, ladder: z.ladder,
        variant: !!z.variant, velX: z.velX, phase: z.phase, altitude: z.altitude | 0,
        vaultT: z.vaultT, vaultVel: z.vaultVel, vaulted: !!z.vaulted,
        vaultDur: z.vaultDur | 0, vaultBonked: !!z.vaultBonked, pogoBroken: !!z.pogoBroken,
        chill: z.chill, butter: z.butter, fuse: z.fuse, summonCd: z.summonCd,
        iceTrap: z.iceTrap, // Zombie::mIceTrapCounter (frozen ticks remaining)
        phaseT: z.phaseT, digCd: z.digCd, digging: !!z.digging, hasObject: z.hasObject === undefined ? true : !!z.hasObject, flying: !!z.flying, flyingHp: z.flyingHp,
        blowingAway: !!z.blowingAway, // Zombie::mBlowingAway (blover-blown drift)
        swimming: !!z.swimming, inPool: !!z.inPool, height: z.height || "normal", ally: !!z.ally, age: z.age, groanCd: z.groanCd,
        yucky: z.yucky, stompCd: z.stompCd, lobCd: z.lobCd, lobTimer: z.lobTimer,
        riseT: z.riseT, bungeeState: z.bungeeState, burnT: z.burnT,
        // Bungee dive state (target cell, umbrella bounce, foley once-flags,
        // stolen plant as a cell+seed link — resolved after the plant loop).
        bungeeCell: z.bungeeCell ? { c: z.bungeeCell.col, r: z.bungeeCell.row } : null,
        hitUmbrella: !!z.hitUmbrella, screamed: !!z.screamed, grassStepped: !!z.grassStepped,
        targPlant: (z.targetPlant && !z.targetPlant.dead) ? { c: z.targetPlant.col, r: z.targetPlant.row, seed: z.targetPlant.seed } : null,
        droppedLoot: !!z.droppedLoot,
        flatTires: !!z.flatTires, dieT: z.dieT | 0, crashed: !!z.crashed, wheelie2: !!z.wheelie2,
        parent: z.parent && !z.parent.dead ? z.parent.saveIdx : -1,
        followers: z.followers ? z.followers.map((f) => (f && !f.dead ? f.saveIdx : -1)) : [-1, -1, -1, -1],
        related: z.related && !z.related.dead ? z.related.saveIdx : -1,
      });
    }
    for (const z of this.zombies) delete z.saveIdx;
    const coins = [];
    for (const c of this.coins) {
      if (c.dead) continue;
      coins.push({
        kind: c.kind, x: c.x, y: c.y, motion: c.motion, vx: c.vx, vy: c.vy,
        groundY: c.groundY, hitGround: !!c.hitGround, disappear: c.disappear,
        fadeCount: c.fadeCount, collected: !!c.collected, collectX: c.collectX,
        collectY: c.collectY, collectDist: c.collectDist, flyT: c.flyT, seed: c.seed,
        alpha: c.alpha, coinAge: c.coinAge, scale: c.scale,
        timesDropped: c.timesDropped | 0, // Coin::DroppedUsableSeed drop count
      });
    }
    const projs = [];
    for (const p of this.projs) {
      if (p.dead) continue;
      projs.push({
        type: p.type, x: p.x, y: p.y, z: p.z, row: p.row, dmg: p.dmg,
        motion: p.motion, velX: p.velX, velY: p.velY, velZ: p.velZ, accZ: p.accZ,
        age: p.age, trailAccum: p.trailAccum, rangeFlags: p.rangeFlags, shadowY: p.shadowY,
        rot: p.rot, rotSpeed: p.rotSpeed, // mRotation/mRotationSpeed (STAR spin)
        hitTorchwoodGridX: p.hitTorchwoodGridX, // mHitTorchwoodGridX (no double-convert after load)
      });
    }
    // Lobbed shots are plain data (img re-resolves via projImage on load).
    const lobs = this.lobs.filter((l) => !l.dead).map((l) => ({
      x: l.x, sx: l.sx, sy: l.sy, y: l.y, z: l.z, tx: l.tx, row: l.row,
      t: l.t, age: l.age, velX: l.velX, velZ: l.velZ, accZ: l.accZ,
      type: l.type, dmg: l.dmg, stun: l.stun, splash: l.splash, rangeFlags: l.rangeFlags, shadowY: l.shadowY,
      rot: l.rot, rotSpeed: l.rotSpeed, // mRotation/mRotationSpeed (spin over the arc)
    }));
    const bowlers = this.bowlers.filter((b) => !b.dead).map((b) => ({
      seed: b.seed, col: b.col, row: b.row, x: b.x, y: b.y,
      renderRow: b.renderRow, state: b.state, launchCounter: b.launchCounter,
    }));
    const mowers = this.mowers.map((m) => (
      m ? { row: m.row, x: m.x, state: m.state, chomp: m.chomp, visible: !!m.visible, height: m.height || "land", alt: m.alt | 0, pool: !!m.pool, roof: !!m.roof } : null
    ));
    return {
      v: 1, level: this.level, finished: this.finished, packetUpgrade: this.packetUpgrade,
      bank: (bank || []).slice(),
      tick: this.tick, sun: this.sun, sunFallen: this.sunFallen, money: this.money, sunCd: this.sunCd,
      currentWave: this.currentWave, numWaves: this.numWaves, waves: this.waves.map((w) => w.slice()),
      zombieCd: this.zombieCd, zombieCdStart: this.zombieCdStart,
      waveHealthStart: this.waveHealthStart, healthToNext: this.healthToNext,
      hugeCd: this.hugeCd, finalSfxCd: this.finalSfxCd,
      progressW: this.progressW, flagRaise: this.flagRaise, flagT: this.flagT || 0,
      recharge: { ...this.recharge },
      tutorialState: this.tutorialState, tutorialTimer: this.tutorialTimer, tutorialArrow: this.tutorialArrow,
      advice: this.advice ? { text: this.advice.text, style: this.advice.style } : null,
      adviceT: this.adviceT, helpShown: { ...this.helpShown }, helpIndex: this.helpIndex,
      rowPickingArray: this.rowPickingArray.map((e) => ({ ...e })),
      waveRowMowed: this.waveRowMowed.slice(), iceTimer: this.iceTimer.slice(), iceMinX: this.iceMinX.slice(),
      iceTrapCounter: this.iceTrapCounter, // Board::mIceTrapCounter (freeze-all countdown)
      fogBlown: this.fogBlown, fogOffset: this.fogOffset, // Board::mFogBlownCountDown/mFogOffset
      gridCelFog: this.gridCelFog.map((c) => c.slice()), // Board::mGridCelFog (look/offset re-roll on load)
      riseCounter: this.riseCounter, gravesCleared: this.gravesCleared,
      // Whack-a-Zombie challenge state (Challenge::mChallengeStateCounter) +
      // hidden-bank slide offset (SeedBank mY). Restored verbatim on load.
      challengeCounter: this.challengeCounter, bankY: this.bankY,
      // Vasebreaker challenge state (Challenge::ScaryPotter*): vases (with
      // contents), stage index, intermission counter, start flag. The hammer
      // swing is transient (a saved mid-swing vase stays closed, re-breakable).
      vase: this.isVase ? {
        vases: this.vases.map((v) => ({ c: v.col, r: v.row, content: { ...v.content }, state: v.state })),
        started: !!this.vaseStarted, stage: this.survivalStage, next: this.nextSurvivalStage,
        lastC: this.vaseLastC | 0, lastR: this.vaseLastR | 0,
      } : null,
      // Stormy-night challenge state (Challenge::mChallengeState/
      // mChallengeStateCounter/mRainCounter): persisted verbatim. The rain
      // splash reanims are transient (retail fx never persist either).
      storm: this.isStormy ? {
        state: this.stormState, counter: this.stormCounter | 0, rain: this.rainCounter | 0,
      } : null,
      plantsShoveled: this.plantsShoveled, enableGraveStones: !!this.enableGraveStones,
      coinBankT: this.coinBankT, sodPosition: this.sodPosition, outOfMoney: this.outOfMoney,
      levelAwardSpawned: !!this.levelAwardSpawned,
      cells, zombies, coins, projs, lobs, bowlers, mowers,
      // Garden rake (GridItem GRIDITEM_RAKE 1630-1638 + UpdateRake state):
      // placement + trigger state persist; the reanim re-derives on load
      // (attracting/waiting frozen at rate 0, triggered re-lit at rate 20).
      rake: this.rake ? { col: this.rake.col, row: this.rake.row, state: this.rake.state, counter: this.rake.counter | 0 } : null,
      rakeLeft: this.rakeLeft | 0,
      conv: {
        packets: this.convPackets.map((p) => ({ seed: p.seed, offset: p.offset, born: p.born })),
        belt: this.convBelt, cd: this.convCd, last: this.convLast, showBowlingLine: !!this.showBowlingLine,
      },
    };
  }
  // LawnLoadGame + FixBoardAfterLoad: rebuild a live board from saveGame()
  // output onto THIS (freshly constructed) board. Visual layers re-derive
  // from pools/state exactly the way the live damage paths set them
  // (applyArmorStage, the no-debris updateDamageStates pass, the per-phase
  // ctor anim branches), so a resumed zombie looks like one that fought its
  // way to the same hp. Returns false on a version/shape mismatch (caller
  // falls back to a fresh start, like TryLoadGame failing LoadGame).
  loadSaveData(s) {
    if (!s || s.v !== 1 || s.level !== this.level) return false;
    try {
      this.tick = s.tick; this.sun = s.sun; this.sunFallen = s.sunFallen;
      this.money = s.money; this.sunCd = s.sunCd;
      this.currentWave = s.currentWave; this.numWaves = s.numWaves; this.waves = s.waves.map((w) => w.slice());
      this.zombieCd = s.zombieCd; this.zombieCdStart = s.zombieCdStart;
      this.waveHealthStart = s.waveHealthStart; this.healthToNext = s.healthToNext;
      this.hugeCd = s.hugeCd; this.finalSfxCd = s.finalSfxCd;
      this.progressW = s.progressW; this.flagRaise = s.flagRaise; this.flagT = s.flagT || 0;
      this.recharge = { ...s.recharge };
      this.tutorialState = s.tutorialState; this.tutorialTimer = s.tutorialTimer;
      this.tutorialArrow = s.tutorialArrow;
      // MessageWidget state (SyncBoard syncs the raw widget): STAY styles
      // hold their pose so they restore verbatim; HUGE re-issues fresh (the
      // per-letter FADE_ON drivers are mid-sweep animation state — restarting
      // the slam is the faithful-enough stand-in).
      this.helpShown = { ...s.helpShown }; this.helpIndex = s.helpIndex;
      if (s.advice && s.advice.style === "HUGE") this.displayAdvice(s.advice.text, "HUGE");
      else {
        this.advice = s.advice ? { text: s.advice.text, style: s.advice.style } : null;
        this.adviceT = s.adviceT;
      }
      this.rowPickingArray = s.rowPickingArray.map((e) => ({ ...e }));
      this.waveRowMowed = s.waveRowMowed.slice();
      this.iceTimer = s.iceTimer.slice(); this.iceMinX = s.iceMinX.slice();
      this.iceTrapCounter = s.iceTrapCounter | 0; // Board::mIceTrapCounter
      // Fog (Board::mFogBlownCountDown/mFogOffset/mGridCelFog): restored
      // verbatim; the look/offset rolls re-roll randomly like a fresh board
      // (retail never persists them either — only the density matters).
      if (typeof s.fogBlown === "number") this.fogBlown = s.fogBlown;
      if (typeof s.fogOffset === "number") this.fogOffset = s.fogOffset;
      if (Array.isArray(s.gridCelFog) && s.gridCelFog.length === 9) {
        for (let fx = 0; fx < 9; fx++) {
          const col = s.gridCelFog[fx];
          if (Array.isArray(col)) for (let fy = 0; fy < this.gridCelFog[fx].length && fy < col.length; fy++)
            this.gridCelFog[fx][fy] = col[fy] | 0;
        }
      }
      this.riseCounter = s.riseCounter; this.gravesCleared = s.gravesCleared;
      if (typeof s.challengeCounter === "number") this.challengeCounter = s.challengeCounter;
      if (typeof s.bankY === "number") this.bankY = s.bankY;
      // Vasebreaker state: restore vases/contents verbatim (RENDER_LAYER_PLANT
      // grid items, never serialized as plants). A cursor-held usable coin
      // restores as a plain resting coin (held is main-side cursor state).
      if (this.isVase && s.vase) {
        this.vases = (s.vase.vases || []).map((v) => ({ col: v.c | 0, row: v.r | 0, content: { ...v.content }, state: v.state || "question", transparent: 0 }));
        this.vaseStarted = !!s.vase.started;
        this.survivalStage = s.vase.stage | 0;
        this.nextSurvivalStage = s.vase.next | 0;
        if (typeof s.vase.lastC === "number") this.vaseLastC = s.vase.lastC;
        if (typeof s.vase.lastR === "number") this.vaseLastR = s.vase.lastR;
        // (pre-fix saves stored lastX/lastY pixels — superseded by grid coords)
      }
      this.heldUsable = null;
      // Stormy-night state: restore verbatim (transient rain reanims are
      // not persisted — they respawn from the rain timer like a fresh board).
      if (this.isStormy && s.storm) {
        if (typeof s.storm.state === "string") this.stormState = s.storm.state;
        if (typeof s.storm.counter === "number") this.stormCounter = s.storm.counter;
        if (typeof s.storm.rain === "number") this.rainCounter = s.storm.rain;
      }
      this.plantsShoveled = s.plantsShoveled; this.enableGraveStones = !!s.enableGraveStones;
      this.coinBankT = s.coinBankT; this.sodPosition = s.sodPosition; this.outOfMoney = s.outOfMoney || 0;
      this.levelAwardSpawned = !!s.levelAwardSpawned;
      // Grid items (SyncDataArray mGridItems): graves carry their rise
      // counters/looks, craters their timers. Retail's load path never runs
      // InitLevel placement (no placeGraves/whack graves/pre-plants on top of
      // the blob), so the constructor's placements are wiped first — else
      // every continue stacks fresh random graves onto the saved ones.
      for (const c of this.cells) { c.grave = false; c.crater = 0; c.lily = c.pot = c.base = c.shell = null; }
      for (const e of s.cells) {
        const cell = this.cell(e.c, e.r);
        if (!cell) continue;
        cell.grave = e.grave || false; cell.crater = e.crater || 0;
        for (const k of ["lily", "pot", "base", "shell"]) {
          const ps = e[k];
          if (!ps) continue;
          const p = new Plant(this, ps.seed, ps.col, ps.row, true);
          p.hp = ps.hp; p.state = ps.state; p.stateCd = ps.stateCd;
          p.launchCd = ps.launchCd; p.fuse = ps.fuse; p.chewCd = ps.chewCd;
          p.produceCd = ps.produceCd; p.wakeUpCd = ps.wakeUpCd;
          p.sleeping = !!ps.sleeping; p.idleRate = ps.idleRate; p.blinkCd = ps.blinkCd;
          p.done = !!ps.done; p.dieCd = ps.dieCd; p.ending = !!ps.ending; p.endingT = ps.endingT;
          p.onBungee = ps.onBungee || "none"; // bungee grab/lift state (steal targets resolve in the zombie loop below)
          if (p.onBungee === "rising") p.body.animRate = 0.1; // pinned ride rate (BungeeLiftTarget)
          p.saveTarg = (typeof ps.targ === "number") ? ps.targ : -1;
          // Squash mid-flight resume (UpdateSquash 1487-1620 edge poses):
          // the silent body wears the spawn pose, so re-play the state's
          // HOLD layer (look by aim side, jumpup through rising, jumpdown
          // falling/done) with animTime at the elapsed fraction; the
          // PARTICLE band flag re-derives from the state; x/y ride the leap
          // again via syncPos.
          if (p.seed === 17 && ps.sq) {
            p.x = ps.sq.x; p.y = ps.sq.y;
            p.targetX = ps.sq.targetX; p.ox = ps.sq.ox; p.oy = ps.sq.oy;
            p.destY = ps.sq.destY; p.targetCol = ps.sq.targetCol | 0;
            p.saveSqTarg = (typeof ps.sq.targ === "number") ? ps.sq.targ : -1;
            p.flightBand = p.state === "rising" || p.state === "falling" || p.state === "done";
            const frac = p.state === "look" ? (80 - Math.max(0, Math.min(80, p.stateCd))) / 80
              : p.state === "prelaunch" ? (45 - Math.max(0, Math.min(45, p.stateCd))) / 45
              : p.state === "falling" ? (10 - Math.max(0, Math.min(10, p.stateCd))) / 10 : 1;
            const layer = p.state === "look" ? (p.targetX < p.x ? "anim_lookleft" : "anim_lookright")
              : (p.state === "falling" || p.state === "done") ? "anim_jumpdown" : "anim_jumpup";
            try {
              if (p.body.trackExists(layer)) {
                const blend = (p.state === "prelaunch" || p.state === "rising") ? 20 : p.state === "look" ? 10 : 0;
                p.body.playReanim(layer, PLAY_ONCE_AND_HOLD, blend, p.state === "falling" ? 60 : 24);
                p.body.animTime = Math.max(0, Math.min(1, frac));
              }
            } catch (e) { /* headless/def missing */ }
            p.syncPos();
          }
          p.flash = 0; p.recentlyEaten = 0; p.glow = 0; p.pendingFire = null; p.shootingCounter = 0;
          // Silent-constructed bodies need the state's pose (the in-play
          // Update* transitions only fire on EDGES, so a resumed mid-state
          // plant would otherwise wear the spawn pose).
          if (p.seed === 4) { // potato: silent builds ARMED; NOTREADY idles
            if (p.state === "notready" && p.body.trackExists("anim_idle")) p.body.playReanim("anim_idle", LOOP, 0, 12);
            else if (p.state === "rising" && p.body.trackExists("anim_rise")) p.body.playReanim("anim_rise", PLAY_ONCE_AND_HOLD, 20, 18);
          } else if (p.seed === 9) { // sun-shroom growth stages
            if (p.state === "growing" && p.body.trackExists("anim_grow")) p.body.playReanim("anim_grow", PLAY_ONCE_AND_HOLD, 10, 12);
            else if (p.state === "big" && p.body.trackExists("anim_bigidle")) p.body.playReanim("anim_bigidle", LOOP, 10, 12 + Math.random() * 3);
          } else if (p.seed === 11) {
            if (p.state === "landing") p.state = "idle"; // gravebuster landing is a 1s pose — resume settled
            else if (p.state === "eating") p.sinkY = 85 * (400 - Math.max(0, Math.min(400, p.stateCd))) / 400; // re-derive the EATING sink (USER OVERRIDE 0->85, not saved)
          }
          else if (p.seed === 13 && p.state !== "ready" && p.body.trackExists("anim_idle")) {
            // Scaredy mid-cower poses (HOLD anims resume with loopCount 0, so
            // the edge transitions re-fire and finish the machine).
            if (p.state === "lowering" && p.body.trackExists("anim_scared")) p.body.playReanim("anim_scared", PLAY_ONCE_AND_HOLD, 10, 10);
            else if (p.state === "scared" && p.body.trackExists("anim_scaredidle")) p.body.playReanim("anim_scaredidle", LOOP, 10, 0);
            else if (p.state === "raising" && p.body.trackExists("anim_grow")) p.body.playReanim("anim_grow", PLAY_ONCE_AND_HOLD, 10, 12);
            else { p.state = "ready"; p.body.playReanim("anim_idle", LOOP, 20, p.idleRate); }
          }
          else if (p.seed === 26) {
            // Cactus rise/lower machine (UpdateCactus 1718-1760): resume the
            // pose; the HOLD anims restart with loopCount 0 so the edge
            // transitions re-fire and finish. Unknown (pre-patch "idle")
            // settles LOW on the idle sway.
            if (p.state === "high" && p.body.trackExists("anim_idlehigh")) p.body.playReanim("anim_idlehigh", LOOP, 20, p.body.def.fps);
            else if (p.state === "rising" && p.body.trackExists("anim_rise")) p.body.playReanim("anim_rise", PLAY_ONCE_AND_HOLD, 20, p.body.def.fps);
            else if (p.state === "lowering" && p.body.trackExists("anim_lower")) p.body.playReanim("anim_lower", PLAY_ONCE_AND_HOLD, 20, p.body.def.fps);
            else { p.state = "low"; if (p.body.trackExists("anim_idle")) p.body.playReanim("anim_idle", LOOP, 20, p.idleRate); }
          }
          else if (p.seed === 35 && p.done && p.body.trackExists("anim_crumble")) p.body.playReanim("anim_crumble", PLAY_ONCE_AND_HOLD, 20, 22);
          else if (p.seed === 31) {
            // Magnet steal resume (UpdateMagnetShroom 2060): the HOLD suck
            // restarts with loopCount 0 so it finishes into CHARGING; the
            // charge/idle poses resume directly. Unknown states settle idle.
            if (p.state === "sucking" && p.body.trackExists("anim_shooting")) p.body.playReanim("anim_shooting", PLAY_ONCE_AND_HOLD, 20, 12);
            else if (p.state === "charging" && p.body.trackExists("anim_nonactive_idle2")) p.body.playReanim("anim_nonactive_idle2", LOOP, 20, 2.0);
            else { if (p.state !== "idle") p.state = "idle"; if (p.body.trackExists("anim_idle")) p.body.playReanim("anim_idle", LOOP, 20, p.idleRate); }
            // The flying item is plain data in the blob (mMagnetItems); the
            // canvas rebuilds from the victim-type atlas (skipped if the def
            // isn't loaded — the countdowns still run). POGO items have no
            // static art (victim-composed, see magnetItemArtSpec) and resume
            // absorbed (null) — the stick stays stolen via the zombie fields.
            if (ps.magnet && ps.magnet.t) {
              try {
                const spec = magnetItemArtSpec(ps.magnet.t);
                const def = spec && this.libs.getReanim(spec[0]);
                const art = def && Plant.cropDefImage(def, spec[1]);
                p.magnetItem = art ? { type: ps.magnet.t, x: ps.magnet.x, y: ps.magnet.y, dx: ps.magnet.dx, dy: ps.magnet.dy, img: art.cv, w: art.w, h: art.h } : null;
              } catch (e) { p.magnetItem = null; }
            }
          }
          else if (p.seed === 27) {
            // Blover resume (PlantInitialize blover branch): silent builds
            // idle; pre-blow re-poses the HOLD sway (the 50-tick countdown
            // and stateCd both persisted, so the blow still lands on
            // schedule), blown resumes the endless blow loop @20.
            if (p.state === "doingspecial") { if (p.body.trackExists("anim_loop")) p.body.playReanim("anim_loop", LOOP, 20, 20); }
            else if (p.body.trackExists("anim_blow")) p.body.playReanim("anim_blow", PLAY_ONCE_AND_HOLD, 0, 20);
          }
          else if (p.seed === 37 && (p.state === "triggered" || p.state === "reflecting") && p.body.trackExists("anim_block")) {
            // Umbrella mid-block resume: re-pose the spring-up HOLD (the
            // countdown/loop gates re-fire and finish the machine).
            p.body.playReanim("anim_block", PLAY_ONCE_AND_HOLD, 0, 22);
          }
          else if (p.seed === 15 && p.fuse > 0 && p.body.trackExists("anim_explode")) {
            // Doom mid-fuse resume: replay the arm pose (UpdateDoomShroom
            // 1584-1600) mid-flight — animTime rides (100-fuse)/100 of the
            // 23-frame explode span, shake overrides re-applied (Reanimation
            // instances don't serialize). No sfx (the fuse already sounded).
            p.body.playReanim("anim_explode", PLAY_ONCE_AND_HOLD, 0, 23);
            p.body.animTime = Math.max(0, Math.min(1, (100 - p.fuse) / 100));
            p.body.setShakeOverride("DoomShroom_head1", 1.0);
            p.body.setShakeOverride("DoomShroom_head2", 2.0);
            p.body.setShakeOverride("DoomShroom_head3", 2.0);
          }
          if (p.sleeping && !p.sleepReanim) p.makeSleepReanim(); // the Zzz is transient (never serialized)
          cell[k] = p;
        }
      }
      // Bowlers (UpdateBowling rollers): fresh bodies + restored motion.
      for (const bs of s.bowlers) {
        const b = new Bowler(this, bs.seed, bs.col, bs.row);
        b.x = bs.x; b.y = bs.y; b.renderRow = bs.renderRow;
        b.state = bs.state; b.launchCounter = bs.launchCounter;
        this.bowlers.push(b);
      }
      // Zombies (SyncDataArray mZombies): fresh spawns re-posed to the
      // snapshot's pools/phase/timers, so visuals match live damage states.
      this.zombies = [];
      for (const zs of s.zombies) {
        const z = new Zombie(this, zs.type, zs.row, zs.wave);
        z.x = zs.x; z.y = zs.y;
        z.hp = zs.hp; z.helm = zs.helm; z.shield = zs.shield; z.paper = zs.paper; z.ladder = zs.ladder;
        z.variant = !!zs.variant; z.phase = zs.phase; z.altitude = zs.altitude | 0;
        z.inPool = !!zs.inPool; z.height = zs.height || "normal"; // pool wading state (CheckForPool/UpdateZombiePool)
        z.vaultT = zs.vaultT; z.vaultVel = zs.vaultVel; z.vaulted = !!zs.vaulted;
        z.vaultDur = zs.vaultDur | 0; z.vaultBonked = !!zs.vaultBonked; z.pogoBroken = !!zs.pogoBroken;
        z.chill = zs.chill; z.butter = zs.butter; z.fuse = zs.fuse; z.summonCd = zs.summonCd;
        z.iceTrap = zs.iceTrap | 0; // mIceTrapCounter restores frozen-remaining
        if (z.iceTrap > 0) z.updateAnimSpeed(); // re-freeze the anim rate (IsImmobilizied gate)
        z.phaseT = zs.phaseT | 0;
        z.digCd = zs.digCd; z.hasObject = zs.hasObject === undefined ? true : !!zs.hasObject; z.digging = z.phase === "tunnel";
        z.flying = !!zs.flying; z.flyingHp = zs.flyingHp; z.swimming = !!zs.swimming;
        z.blowingAway = !!zs.blowingAway; // Zombie::mBlowingAway
        z.ally = !!zs.ally; z.age = zs.age; z.groanCd = zs.groanCd; z.yucky = zs.yucky;
        z.stompCd = zs.stompCd; z.lobCd = zs.lobCd; z.lobTimer = zs.lobTimer;
        z.riseT = zs.riseT; z.bungeeState = zs.bungeeState; z.burnT = zs.burnT;
        if (z.type === "bungee") {
          // Bungee links (PickBungeeZombieTarget target cell, target plant):
          // the ctor pick ran on the half-loaded lawn — restore the saved
          // target (plants restore before zombies, so the link resolves).
          z.row = zs.row;
          z.bungeeCell = (zs.bungeeCell) ? { col: zs.bungeeCell.c | 0, row: zs.bungeeCell.r | 0 } : null;
          z.hitUmbrella = !!zs.hitUmbrella; z.screamed = !!zs.screamed; z.grassStepped = !!zs.grassStepped;
          z.cargo = null; z.carrier = null; // held cargo never persists (skipped in saves) — the carrier re-dives solo
          z.targetPlant = null;
          if (zs.targPlant) {
            const tp = zs.targPlant, cell = this.cell(tp.c | 0, tp.r | 0);
            if (cell) for (const k of ["lily", "pot", "base", "shell", "flying"]) {
              const p = cell[k];
              if (p && !p.dead && p.seed === tp.seed && p.onBungee !== "none") { z.targetPlant = p; break; }
            }
          }
        }
        z.flatTires = !!zs.flatTires; z.dieT = zs.dieT | 0; // zamboni flat-tire dying state
        z.crashed = !!zs.crashed; z.wheelie2 = !!zs.wheelie2; // bobsled crash flag + zamboni wheelie layer
        z.eating = false; z.justShot = 0; z.shieldShot = 0; z.shieldRecoil = 0;
        z.droppedLoot = true; z.lastFlags = 16; // DOESNT_LEAVE_BODY: hide limbs, spawn no debris, drop no loot
        z.updateDamageStates(); // arm/head hides per the live hp thresholds
        z.droppedLoot = !!zs.droppedLoot; z.lastFlags = 1;
        z.applyArmorStage(); // cracked cone/bucket/door/paper/ladder/football/hardhat cels
        // Zamboni damage stages the ctor doesn't know about (TakeBodyDamage
        // 7809-7817): stage 1 DAMAGE1, stage 2 DAMAGE2 + the looping stack
        // smoke pinned at (27,72) like the live transition does.
        if (z.type === "zamboni" && !z.flatTires) {
          const idx = z.bodyDamageIndex();
          if (idx === 1) {
            z.body.setImageOverrideByKey("Zombie_zamboni_1", "IMAGE_REANIM_ZOMBIE_ZAMBONI_1_DAMAGE1");
            z.body.setImageOverrideByKey("Zombie_zamboni_2", "IMAGE_REANIM_ZOMBIE_ZAMBONI_2_DAMAGE1");
          } else if (idx === 2) {
            z.body.setImageOverrideByKey("Zombie_zamboni_1", "IMAGE_REANIM_ZOMBIE_ZAMBONI_1_DAMAGE2");
            z.body.setImageOverrideByKey("Zombie_zamboni_2", "IMAGE_REANIM_ZOMBIE_ZAMBONI_2_DAMAGE2");
            this.spawnZamSmoke(z.x + 27, z.y + 72, z);
          }
        } else if (z.type === "zamboni" && z.flatTires) {
          // Flat-tired dying zamboni (ZamboniDeath spike branch): the
          // DAMAGE2 art rides along; the wheelie smoke re-attaches only on
          // the non-wheelie2 branch like the live transition.
          z.body.setImageOverrideByKey("Zombie_zamboni_1", "IMAGE_REANIM_ZOMBIE_ZAMBONI_1_DAMAGE2");
          z.body.setImageOverrideByKey("Zombie_zamboni_2", "IMAGE_REANIM_ZOMBIE_ZAMBONI_2_DAMAGE2");
          if (!z.wheelie2) this.spawnZamSmoke(z.x + 27, z.y + 72, z);
        }
        // DetachShield visuals the fresh spawn doesn't know about: hair back
        // once the helm is gone, plain arms back once the door/ladder is gone.
        if ((z.type === "cone" || z.type === "bucket" || z.type === "football") && z.helm <= 0 && z.body.trackExists("anim_hair"))
          z.body.assignRenderGroupToPrefix("anim_hair", RENDER_GROUP_NORMAL);
        if (z.type === "door" && z.shield <= 0) {
          z.showDoorArms(false);
          if (z.body.trackExists("anim_screendoor")) z.body.assignRenderGroupToPrefix("anim_screendoor", RENDER_GROUP_HIDDEN);
        }
        if (z.type === "ladder" && z.ladder <= 0 && z.body.trackExists("Zombie_outerarm") && z.hasArm)
          z.body.assignRenderGroupToPrefix("Zombie_outerarm", RENDER_GROUP_NORMAL);
        // Limp home: the ctor's spawn anim only fits the spawn phase, so
        // replay the phase's walk layer the way the live transitions do, then
        // pin the snapshot's own speed (PickRandomSpeed re-rolls per head).
        // ZDYING (flat-tired zamboni) replays its wheelie layer like
        // ZamboniDeath does (@10, not re-rolled); crashing bobsleds replay
        // the crash walk; sliding/boarding replay push/jump-hold.
        if (z.type === "zamboni" && z.phase === "zdying") {
          if (z.wheelie2) z.playZombie("anim_wheelie2", PLAY_ONCE_AND_HOLD, 10, 10);
          else z.playZombie("anim_wheelie1", PLAY_ONCE_AND_HOLD, 10, 12);
        }
        else if (z.type === "zamboni") z.playZombie("anim_drive", LOOP, 0, 12);
        else if (z.type === "bobsled" && z.phase === "crashing") z.playZombie("anim_walk", LOOP, 0, 0);
        else if (z.type === "bobsled" && z.phase === "sliding") z.playZombie("anim_push", LOOP, 0, 30);
        else if (z.type === "bobsled" && z.phase === "boarding") z.playZombie("anim_jump", PLAY_ONCE_AND_HOLD, 0, 20);
        else if (z.type === "catapult") z.playZombie("anim_walk", LOOP, 0, 5.5);
        else if (z.type === "digger" && z.phase === "tunnel") { z.playZombie("anim_dig", LOOP_FULL_LAST_FRAME, 0, 12); z.startDiggerSong(); try { this.spawnDiggerTunnel(z); } catch (e) {} }
        else if (z.type === "digger" && z.phase === "digrise") { if ((z.phaseT | 0) > 30) z.playZombie("anim_drill", LOOP, 0, 20); else z.playZombie("anim_landing", PLAY_ONCE_AND_HOLD, 0, 12); }
        else if (z.type === "digger" && z.phase === "digrisenoaxe") { if ((z.phaseT | 0) > 30) z.playZombie("anim_drill", LOOP, 0, 20); else z.playZombie("anim_landing", PLAY_ONCE_AND_HOLD, 20, 12); }
        else if (z.type === "digger" && z.phase === "digpause") { z.origRate = 0; z.body.animRate = 0; }
        else if (z.type === "digger" && z.phase === "digstun") z.playZombie("anim_dizzy", LOOP, 10, 12);
        else if (z.type === "pole" && z.phase === "prevault") z.playZombie("anim_run", LOOP, 0, 0);
        else if (z.phase === "invault") z.playZombie("anim_jump", PLAY_ONCE_AND_HOLD, 20, 24);
        else if (z.type === "snorkel" && z.phase === "snorkel-walk") { /* land walk: generic below */ }
        else if (z.inPool && z.height === "normal" && (z.phase === "poolwalk" || z.phase === "dolphin-poolwalk" || z.phase === "ride")) { /* generic swim below */ }
        else if (z.type === "news" && z.phase === "maddening") {
          if (z.body.trackExists("anim_gasp")) z.playZombie("anim_gasp", PLAY_ONCE_AND_HOLD, 10, 8);
          else z.updateNewspaper(true);
        } else if (z.phase === "dancerise") { z.origRate = 0; z.body.animRate = 0; } // rising backup: frozen rate (SetAnimRate(0), 2798)
        else if (z.type === "balloon" && z.phase === "flying") {
          // Balloon still airborne: re-pose the idle hover + re-attach the
          // transient propeller reanim (never serialized).
          z.playZombie("anim_idle", LOOP, 0, 0);
          try {
            z.propeller = this.makeReanim(ROSTER[z.type].reanim, z.x, z.y);
            if (z.propeller.trackExists("Propeller")) z.propeller.playReanim("Propeller", LOOP_FULL_LAST_FRAME, 0, 12);
            else z.propeller = null;
            if (z.propeller) z.propeller.attachTo(z.body, "hat");
          } catch (e) { z.propeller = null; }
        }
        else if (z.type === "balloon" && z.phase === "popping") z.playZombie("anim_pop", PLAY_ONCE_AND_HOLD, 20, 24);
        else if (z.type === "jack" && z.phase === "popping") {
          // Mid-pop resume: replay the pop HOLD like the live transition
          // (UpdateZombieJackInTheBox 1990, PLAY_ONCE_AND_HOLD @28) — the ctor
          // played the walk and started the crank, both wrong for a popping
          // jack, so the crank stops too (StopZombieSound 1988).
          z.playZombie("anim_pop", PLAY_ONCE_AND_HOLD, 20, 28);
          z.stopJackSong();
        }
        else if (z.type === "jack" && z.phase === "normal") {
          // Magnet-stolen resume: the ctor shows the box, but a phase-normal
          // jack was already stripped (MagnetShroomAttactItem 1961-1963).
          z.body.assignRenderGroupToPrefix("Zombie_jackbox_box", RENDER_GROUP_HIDDEN);
          z.body.assignRenderGroupToPrefix("Zombie_jackbox_handle", RENDER_GROUP_HIDDEN);
        }
        // Digger without its axe (stolen): pickaxe+dirt stay hidden like live DiggerLoseAxe.
        if (z.type === "digger" && !z.hasObject) {
          if (z.body.trackExists("Zombie_digger_pickaxe")) z.body.assignRenderGroupToPrefix("Zombie_digger_pickaxe", RENDER_GROUP_HIDDEN);
          if (z.body.trackExists("Zombie_digger_dirt")) z.body.assignRenderGroupToPrefix("Zombie_digger_dirt", RENDER_GROUP_HIDDEN);
        }
        else if (z.type === "bungee") {
          // Bungee resume (the ctor pick ran on the half-loaded lawn and may
          // have died): clear the ctor death, re-apply the arm groups,
          // re-pose per phase.
          z.dead = false; z.gone = false;
          for (const tr of ["Zombie_bungi_rightarm_lower2", "Zombie_bungi_rightarm_hand2", "Zombie_bungi_leftarm_lower2", "Zombie_bungi_leftarm_hand2"])
            z.body.assignRenderGroupToPrefix(tr, RENDER_GROUP_ARMS);
          z.variant = false;
          if (z.bungeeState === "grabbing") z.playZombie("anim_grab", PLAY_ONCE_AND_HOLD, 0, 24);
          else if (z.bungeeState === "rising") z.playZombie("anim_raise", PLAY_ONCE_AND_HOLD, 0, 36);
          else if (z.bungeeState === "bottom" || z.bungeeState === "ouchy") z.playZombie("anim_idle", LOOP, 10, 12);
          else { if (z.bungeeState !== "screaming") z.bungeeState = "diving"; z.playZombie("anim_drop", LOOP, 0, 24); }
        }
        else z.startWalkAnim(0);
        if (z.type === "news" && z.phase === "mad" && z.hasHead && z.body.trackExists("anim_head1"))
          z.body.setImageOverrideByKey("anim_head1", "IMAGE_REANIM_ZOMBIE_PAPER_MADHEAD");
        // The ctor starts the crank for every jack (ZombieInitialize
        // 442-445 + StartZombieSound 821-824) — a headless running jack must
        // not hum (StartZombieSound 7406: RUNNING + head gate).
        if (z.type === "jack" && z.phase === "running" && !z.hasHead) z.stopJackSong();
        z.velX = zs.velX; z.updateAnimSpeed();
        z.saveParent = zs.parent; z.saveFollowers = zs.followers; z.saveRelated = zs.related;
        this.zombies.push(z);
      }
      for (const z of this.zombies) {
        z.parent = (z.saveParent >= 0 && this.zombies[z.saveParent]) ? this.zombies[z.saveParent] : null;
        delete z.saveParent;
        if (Array.isArray(z.saveFollowers)) {
          z.followers = z.saveFollowers.map((i) => (i >= 0 && this.zombies[i]) ? this.zombies[i] : null);
          while (z.followers.length < 4) z.followers.push(null);
        }
        delete z.saveFollowers;
        z.related = (z.saveRelated >= 0 && this.zombies[z.saveRelated]) ? this.zombies[z.saveRelated] : null;
        delete z.saveRelated;
      }
      // Tangle kelp victims (mTargetZombieID): re-link by zombie index and
      // re-attach the grab vines (transient reanims, never serialized).
      for (const c of this.cells) for (const k of ["lily", "pot", "base", "shell"]) {
        const p = c[k];
        if (!p || p.seed !== 19 || p.state !== "grabbing") continue;
        const t = (typeof p.saveTarg === "number") ? this.zombies[p.saveTarg] : null;
        p.targetZombie = (t && !t.dead && !t.gone) ? t : null;
        if (p.targetZombie) {
          let vx = -13, vy = 15;
          if (p.targetZombie.type === "snorkel") { vx = -43; vy = 55; }
          if (p.targetZombie.phase === "ride") { vx = -20; vy = 37; }
          try {
            const g = this.makeReanim("Tanglekelp", p.targetZombie.x + vx, p.targetZombie.y + vy);
            if (g.trackExists("anim_grab")) g.playReanim("anim_grab", PLAY_ONCE_AND_HOLD, 0, 24);
            g.grabDX = vx; g.grabDY = vy;
            p.targetZombie.tangleFx = g;
          } catch (e) { /* headless/def missing */ }
        }
      }
      // Squash preferred targets (mTargetZombieID): re-link by zombie index
      // (the in-flight re-aim preference; transient bodies re-posed above).
      for (const c of this.cells) for (const k of ["lily", "pot", "base", "shell"]) {
        const p = c[k];
        if (!p || p.seed !== 17 || typeof p.saveSqTarg !== "number") continue;
        const t = this.zombies[p.saveSqTarg];
        p.sqTarget = (t && !t.dead && !t.gone) ? t : null;
      }
      // Coins (SyncDataArray mCoins): data restores verbatim; the sun reanim
      // is renderer-owned (rebuilt every frame in main.js), like live coins.
      this.coins = [];
      for (const cs of s.coins) {
        const c = new Coin(this, cs.kind, cs.x, cs.y, cs.motion);
        c.x = cs.x; c.y = cs.y; c.vx = cs.vx; c.vy = cs.vy; c.groundY = cs.groundY;
        c.hitGround = !!cs.hitGround; c.disappear = cs.disappear; c.fadeCount = cs.fadeCount;
        c.collected = !!cs.collected; c.collectX = cs.collectX; c.collectY = cs.collectY;
        c.collectDist = cs.collectDist; c.flyT = cs.flyT; c.seed = cs.seed;
        c.alpha = cs.alpha; c.coinAge = cs.coinAge; c.scale = cs.scale;
        c.timesDropped = cs.timesDropped | 0; c.held = false; // cursor hold never persists (resting coin)
        this.coins.push(c);
      }
      // Projectiles + lobbed shots (SyncDataArray mProjectiles): data only.
      this.projs = [];
      for (const ps of s.projs) {
        const p = new Proj(this, {
          type: ps.type, x: ps.x, y: ps.y, z: ps.z, row: ps.row, dmg: ps.dmg,
          motion: ps.motion, velX: ps.velX, velY: ps.velY, velZ: ps.velZ, accZ: ps.accZ,
          rangeFlags: ps.rangeFlags, shadowY: ps.shadowY, rot: ps.rot, rotSpeed: ps.rotSpeed,
        });
        p.age = ps.age; p.trailAccum = ps.trailAccum;
        p.hitTorchwoodGridX = ps.hitTorchwoodGridX ?? -1;
        // ConvertToFireball's attachment is transient (never serialized) —
        // re-forge it so loaded fire peas render like live ones.
        if (p.type === "fire") this.attachFirePea(p);
        this.projs.push(p);
      }
      this.lobs = s.lobs.map((l) => ({ ...l, img: this.projImage(l.type), dead: false, rot: l.rot ?? 0, rotSpeed: l.rotSpeed ?? 0 }));
      // Mowers (SyncDataArray mLawnMowers): rest positions rebuild like the
      // ctor (body art + idle pose), running ones re-light the engine.
      this.mowers = s.mowers.map((m) => {
        if (!m) return null;
        const roofRow = this.bg === BG.ROOF || this.bg === BG.BOSS;
        const m2 = { row: m.row, x: m.x, y: posYOnRow(this.bg, -120, m.row) + 15, state: m.state, chomp: m.chomp, body: null, visible: !!m.visible, height: m.height || "land", alt: m.alt | 0,
          pool: m.pool ?? (!roofRow && this.isWaterRow(m.row) && this.hasPoolCleaner), roof: m.roof ?? roofRow };
        this.initMowerBody(m2);
        if (m2.body) m2.body.animRate = m2.state === "run" ? (m2.pool ? 35 : 70) : 0;
        return m2;
      });
      this.convPackets = s.conv.packets.map((p) => ({ ...p }));
      this.convBelt = s.conv.belt; this.convCd = s.conv.cd; this.convLast = s.conv.last;
      this.showBowlingLine = !!s.conv.showBowlingLine;
      // Garden rake (GridItem GRIDITEM_RAKE): rebuild the reanim like the
      // ctor placement (CreateRakeReanim 1580-1587); a mid-swing resume
      // re-lights the trigger rate, an idle one stays frozen.
      this.rakeLeft = s.rakeLeft | 0 || 0;
      this.rake = null;
      if (s.rake) {
        try {
          const x = gridToPixelX(s.rake.col, this.bg), y = gridToPixelY(s.rake.col, s.rake.row, this.bg);
          const body = this.makeReanim("Rake", x + 20, y);
          body.animRate = s.rake.state === "triggered" ? 20 : 0;
          body.loopType = PLAY_ONCE_AND_HOLD;
          this.rake = { col: s.rake.col, row: s.rake.row, x, y, state: s.rake.state, counter: s.rake.counter | 0, body };
        } catch (e) { this.rake = null; }
      }
      this.state = "play"; this.paused = true; this.introT = 0; this.shake = 0;
      this.winner = null; this.lossT = 0; this.ended = false;
      this.endCd = 0; this.fadeOut = -1;
      this.packetFlash = {};
      return true;
    } catch (e) { return false; }
  }
  isDirtRow(r) { return this.dirtRows.has(r); }
  // ----- conveyor belt (SeedBank 1007-1156, Challenge 1621-1922) -----
  // Free pre-plants (Challenge::InitLevel NewPlant): no cost, no recharge,
  // no planting effects — like NewPlant, not AddPlant/MouseDownWithPlant.
  newPlantFree(c, r, seed) {
    const cell = this.cell(c, r);
    if (!cell || cell.base) return null;
    const p = new Plant(this, seed, c, r);
    cell.base = p;
    return p;
  }
  // SeedBank::AddSeed (1007): append at 515-51*n (right side), clamped to
  // prev+40; full bank (10) drops the seed.
  convAddSeed(seed, placeOnLeft = false) {
    const n = this.convPackets.length;
    if (n >= 10) return;
    let off = placeOnLeft ? 0 : 515 - 51 * n;
    if (n > 0) {
      const prev = this.convPackets[n - 1].offset;
      if (off < prev) off = prev + 40;
    }
    this.convPackets.push({ seed, offset: off, born: this.tick });
  }
  // SeedBank::RemoveSeed (1040): shift later packets' types left, offset =
  // next.offset+51; last cleared.
  convRemoveSeed(idx) {
    const n = this.convPackets.length;
    if (idx < 0 || idx >= n) return;
    for (let i = idx; i < n; i++) {
      if (i === n - 1) { this.convPackets.pop(); break; }
      this.convPackets[i].seed = this.convPackets[i + 1].seed;
      this.convPackets[i].offset = this.convPackets[i + 1].offset + 51;
      this.convPackets[i].born = this.convPackets[i + 1].born;
    }
  }
  convCount(seed) {
    let n = 0;
    for (const p of this.convPackets) if (p.seed === seed) n++;
    return n;
  }
  // A conveyor packet can only be lifted once it is visible on the belt:
  // packets spawn just past the right clip edge (draw x ~= clip right) and
  // slide in, so a fresh packet has zero drawn pixels. The draw/clip
  // geometry (SeedBank::Draw 915-937: packets at i*50+91+offset under clip
  // (90,0,501,600)) reduces shift-independently to offset < 500-50*i for
  // any part of the 50px packet to show.
  convPacketVisible(i) {
    const p = this.convPackets[i];
    if (!p) return false;
    return p.offset < 500 - 50 * i;
  }
  // Red-tinted Wallnut atlas for explode-o-nut (Plant Color(255,64,64)
  // multiply: R stays, G/B *64/255). Baked once per board from the Wallnut
  // atlas canvas — same rects, tinted image.
  getExplodeDef() {
    if (this.explodeDef) return this.explodeDef;
    try {
      const def = this.libs.getReanim("Wallnut");
      const src = def.atlas;
      if (!src || !src.width) return null;
      const cv = document.createElement("canvas");
      cv.width = src.width; cv.height = src.height;
      const g = cv.getContext("2d", { willReadFrequently: true });
      g.drawImage(src, 0, 0);
      const id = g.getImageData(0, 0, cv.width, cv.height), d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        d[i + 1] = (d[i + 1] * 64 / 255) | 0;
        d[i + 2] = (d[i + 2] * 64 / 255) | 0;
      }
      g.putImageData(id, 0, 0);
      this.explodeDef = { fps: def.fps, atlas: cv, tracks: def.tracks, images: def.images };
      return this.explodeDef;
    } catch (e) { return null; }
  }
  // Challenge::UpdateConveyorBelt (1621-1649): slide first, then the spawn
  // timer. L5 has no speed multiplier (x1). Count thresholds pick the reset
  // (400/425/500/1000). HasLevelAwardDropped has no equivalent here (awards
  // resolve at level-complete), so it always runs during play.
  convUpdate() {
    if (!this.isConveyor) return;
    this.convBelt++;
    if (this.convBelt % CONVEYOR_SPEED === 0) {
      for (const p of this.convPackets) if (p.offset > 0) p.offset = Math.max(0, p.offset - 1);
    }
    if (--this.convCd > 0) return;
    const n = this.convPackets.length;
    this.convCd = n > 8 ? 1000 : n > 6 ? 500 : n > 4 ? 425 : 400;
    this.convUpdatePick();
  }
  // Challenge::UpdateConveyorBelt pick (1857-1921): per-entry live weights
  // from bank + lawn counts (TodPickFromWeightedArray over the adjusted
  // table), then AddSeed + mLastConveyorSeedType. SEED_LILYPAD (1869-1872)
  // ramps its weight w -> 1 as lawn + bank lilies approach 18
  // (TodAnimateCurve LINEAR), so the pool belt floods lilies early and stops
  // offering them once the water is covered. SEED_GRAVEBUSTER (1864-1870)
  // zeroes out once the standing stones (lawn + belt busters) cover the
  // remaining graves — live on the L20 night belt, dormant elsewhere by
  // construction (no other in-scope table holds that seed). SEED_FLOWERPOT +
  // the final-boss pot rules (1876-1900) don't apply in scope. L5
  // has 2 entries so the count>2 gate skips and the pick stays a pure 85/15
  // roll, exactly as before.
  convUpdatePick() {
    const table = conveyorSeedTable(this.level) || [];
    if (!table.length) return;
    const weights = table.map((e) => {
      let w = e.w;
      const inBank = this.convCount(e.seed);
      if (e.seed === 11) {
        // Challenge 1864-1870: no more busters than graves. aTotalCount =
        // lawn busters + belt busters; GetGraveStonesCount = standing stones.
        const grown = inBank + this.countSeedPlants(11);
        let stones = 0;
        for (const c of this.cells) if (c.grave) stones++;
        if (stones <= grown) w = 0;
      } else if (e.seed === 16) {
        const grown = inBank + this.allPlants().filter((p) => p.seed === 16).length;
        w = grown <= 0 ? w : grown >= 18 ? 1 : w + (1 - w) * (grown / 18);
      }
      if (table.length > 2) {
        if (inBank >= 4) w = 1;
        else if (inBank >= 3) w = 5;
        else if (e.seed === this.convLast) w = Math.floor(w / 2);
      }
      return w;
    });
    let total = 0;
    for (const w of weights) total += w;
    let roll = Math.floor(Math.random() * total), idx = weights.length - 1;
    for (let i = 0; i < weights.length; i++) { roll -= weights[i]; if (roll < 0) { idx = i; break; } }
    const pick = table[idx].seed;
    this.convAddSeed(pick);
    this.convLast = pick;
  }
  // Challenge::UpdateStormyNight (Challenge.cpp 1955-2005): the lightning
  // state machine. Runs every tick in every scene — before the pause gate in
  // Challenge::Update (2139-2150) — so the port calls it from the top of
  // update() AND from the paused board tick in main (the sim alone never runs
  // while paused). STORM_FLASH_TIME = 150.
  updateStorm() {
    if (!this.isStormy) return;
    if (this.paused) {
      if (this.stormCounter === 1) return;
      if (this.stormCounter === 150 && this.stormState === "flash1") {
        this.stormCounter = 1;
        return;
      }
    }
    this.stormCounter--;
    if ((this.stormCounter === 300 && (this.stormState === "flash1" || this.stormState === "flash2")) ||
      (this.stormCounter === 150 && (this.stormState === "flash1" || this.stormState === "flash3"))) {
      this.sfx("thunder"); // FOLEY_THUNDER (TodFoley.cpp:27, pitch 10)
    }
    if (this.stormCounter > 0) return;
    if (this.state === "lost") { // mGameScene == SCENE_ZOMBIES_WON
      this.stormCounter = 150 + (-50 + Math.floor(Math.random() * 101));
      this.stormState = "flash3";
      return;
    } else if (this.state !== "play") { // any non-playing scene
      this.stormState = "normal";
      this.stormCounter = 0;
      return;
    } else {
      const yeti = this.zombies.some((z) => !z.dead && !z.gone && z.type === "yeti");
      if (yeti) this.stormCounter = 150 + (200 + Math.floor(Math.random() * 101));
      else this.stormCounter = 150 + (300 + Math.floor(Math.random() * ((Math.random() < 0.5 ? 400 : 750) - 300 + 1)));
      const states = ["flash1", "flash2", "flash3"];
      this.stormState = states[Math.floor(Math.random() * 3)];
    }
  }
  // Challenge::UpdateRain (5193-5221): every 10-20 ticks, three GROUND-layer
  // splash reanims ride the lawn (top, middle, bottom bands). Retail bug
  // replicated exactly: the circle/splash rolls (5208-5210) are written back
  // onto the FIRST splash reanim (aSplashReanim), so splash #1 wears the
  // circle's alpha/scale and the circle keeps its defaults.
  updateRain() {
    if (!this.isStormy) return;
    if (--this.rainCounter >= 0) return;
    const R = (a, b) => a + Math.random() * (b - a);
    const mk = (def, x, y) => {
      try { return this.makeReanim(def, x, y); }
      catch (e) { return null; } // headless/def missing
    };
    const r1 = mk("Rain_splash", R(40, 740), R(90, 240));
    if (r1) {
      r1.loopType = PLAY_ONCE; // retail AllocReanimation default: the burst plays
      // once, then the updateFx sweep frees it (else 3 looping reanims pile up
      // every 10-20 ticks — unbounded leak, pool drowned in circles).
      r1.alpha = R(100, 200) / 255;
      const s = R(0.7, 1.2); r1.setScale(s, s);
      this.rainFx.push({ reanim: r1 });
    }
    const c = mk("Rain_circle", R(40, 740), R(290, 410));
    if (c) { c.loopType = PLAY_ONCE; this.rainFx.push({ reanim: c }); }
    // Retail 5208-5210: the circle's rolls land on the first splash reanim.
    if (r1) {
      r1.alpha = R(50, 150) / 255;
      const s = R(0.7, 1.1); r1.setScale(s, s);
    }
    const r2 = mk("Rain_splash", R(40, 740), R(450, 580));
    if (r2) {
      r2.loopType = PLAY_ONCE; // same one-shot default as above
      r2.alpha = R(100, 200) / 255;
      const s = R(0.7, 1.2); r2.setScale(s, s);
      this.rainFx.push({ reanim: r2 });
    }
    this.rainCounter = 10 + Math.floor(Math.random() * 11);
  }
  // Challenge::Update stormy-night portion as it runs inside Board::Update
  // (5933) during SCENE_LEVEL_INTRO: Board::Update ticks in every scene, so
  // the lightning machine + rain spawner run through the whole intro — the
  // counter falls 100->0 (~1s) into full NORMAL/0 darkness, and the
  // pan-right-end-1000 / pan-left-end edges (CutScene 1300-1304) restart it
  // at FLASH_2/310 so lightning lights up the zombie lineup. The cutscene
  // clock may freeze (Dave message / chooser / shovel tutorial gate inside
  // CutScene::Update) but Board::Update does not — so main calls this every
  // frame regardless of the cutscene time-stop. updateStorm carries its own
  // pre-pause-gate semantics (2139-2140); the rain spawner stays post-gate
  // (frozen while paused). The splash reanims ride the frame like every
  // other reanim (LawnApp::UpdateReanimations runs in all scenes).
  tickIntroStorm() {
    if (!this.isStormy) return;
    this.fxClock = (this.fxClock | 0) + 1; // free-running rain-drift clock (mEffectCounter keeps ticking while the cutscene clock freezes on Dave)
    this.updateStorm();
    if (this.paused) return;
    this.updateRain();
    for (const rf of this.rainFx) rf.reanim.update();
    this.rainFx = this.rainFx.filter((rf) => !rf.reanim.dead);
  }
  // ----- tutorial (Board::DisplayAdvice/ClearAdvice/SetTutorialState/UpdateTutorial) ----
  // DisplayAdvice (1967): a labeled helpKey shows only once per level
  // (mHelpDisplayed); ADVICE_NONE (null key) always re-displays.
  displayAdvice(text, style, helpKey = null) {
    if (helpKey !== null && helpKey !== undefined) {
      if (this.helpShown[helpKey]) return;
      this.helpShown[helpKey] = true;
    }
    this.advice = { text, style };
    this.adviceT = ADVICE_DUR[style] ?? 500;
    this.helpIndex = helpKey ?? -1;
    if (style === "HUGE") {
      // MessageWidget::SetLabel (101-104) + LayoutReanimText (124-171): the
      // HUGE_WAVE label lasts 750 ticks, slides off over labelLen+100, and
      // every letter gets a REANIM_TEXT_FADE_ON driver. The enter sweep is
      // TextFadeOn frames 0-19 (SetFramesForLayer("anim_enter"): frames 0-19
      // hold the initial mFrame 0, but the explicit -1 at frame 20 poisons
      // the hold, so 21-39 are blank too); the leave sweep (played when
      // duration hits slideOffTime) is frames 19-39
      // (SetFramesForLayer("anim_leave"): blank until the explicit 0 at 19).
      // So letters slam scale 2->1 over ~34 ticks, HOLD visible, then
      // hold-and-fade out. Letter screen positions need font metrics, so
      // layout happens lazily at draw time (see drawAdvice).
      this.advice.letters = [...text].map((ch) => ({ ch, mode: "enter", t: 0, rate: 60, start: 0, count: 20 }));
      this.advice.slideOff = text.length + 100;
      this.advice.displayTime = this.adviceT;
    }
  }
  // ClearAdvice (1999): clears only when the key matches (or ADVICE_NONE).
  clearAdvice(key = null) {
    if (key === null || key === undefined || key === this.helpIndex) {
      this.advice = null; this.adviceT = 0; this.helpIndex = -1;
    }
  }
  // MessageWidget::Update (174): only non-STAY durations count down.
  updateAdvice() {
    if (this.adviceT < 10000 && this.adviceT > 0 && --this.adviceT === 0) this.advice = null;
    // MessageWidget::Update letter loop (194-227): the per-letter FADE_ON
    // drivers tick with the widget every tick, using the post-decrement
    // duration (Board::Update runs mAdvice->Update after UpdateGame, 5879).
    if (this.advice && this.advice.style === "HUGE") this.updateHugeLetters();
  }
  // MessageWidget::Update (205-226) for REANIM_TEXT_FADE_ON: flat rate 60
  // while duration > slideOffTime; at duration == slideOffTime each letter
  // plays "anim_leave" (animTime reset, range 19-39) and its rate follows
  // TodAnimateCurveFloat(0, 50, (slideOff-duration)*100 - pos, 0, 40, LINEAR).
  updateHugeLetters() {
    const adv = this.advice, dur = this.adviceT;
    for (let i = 0; i < adv.letters.length; i++) {
      const L = adv.letters[i];
      if (dur > adv.slideOff) {
        L.rate = 60;
      } else {
        if (dur === adv.slideOff && L.mode !== "leave") {
          L.mode = "leave"; L.t = 0; L.start = 19; L.count = 21;
        }
        const x = (adv.slideOff - dur) * 100 - i;
        L.rate = Math.max(0, Math.min(40, (40 * x) / 50));
      }
      // Reanimation::Update (408): PLAY_ONCE_AND_HOLD clamps animTime to 1.
      L.t += 0.01 * L.rate / L.count;
      if (L.t >= 1) L.t = 1; else if (L.t < 0) L.t = 0;
    }
  }
  countSeedPlants(seed) {
    let n = 0;
    for (const c of this.cells) for (const k of ["lily", "pot", "base", "shell", "flying"]) {
      const p = c[k];
      if (p && !p.dead && p.seed === seed) n++;
    }
    return n;
  }
  // SeedPacket::CanPickUp (661), trimmed to fixed-bank play: active
  // (recharged) + affordable. Upgrade/soil requirements never apply to
  // pea/sunflower and conveyor/slot modes are out of scope.
  canPickUpSeed(seed) {
    if (this.state !== "play") return false;
    // Conveyor packets are always active and free (CanPickUp 687 skips the
    // sun check when HasConveyorBeltSeedBank).
    if (this.isConveyor) return true;
    if ((this.recharge[seed] | 0) > 0) return false;
    if (this.sun < PLANTS[seed].cost) return false;
    return true;
  }
  // SeedPacket::FlashIfReady (SeedPacket.cpp:86-109): the ready sparkle
  // (PARTICLE_SEED_PACKET_FLASH) + the REFRESH->PICK_UP tutorial advance,
  // gated on CanPickUp (661: active packet, affordable, requirements met).
  // Callers: refresh completion (158) and the sun that newly covers a cost
  // (Coin 1260-1271). (The mainCounter==0 firing is invisible in retail.)
  flashIfReady(seed) {
    if (!this.canPickUpSeed(seed)) return;
    if (this.isConveyor) return; // no bank packets on the belt (91)
    this.packetFlash[seed] = 25;
    if (this.tutorialState === TUT.L1_REFRESH_PEASHOOTER) {
      this.setTutorialState(TUT.L1_PICK_UP_PEASHOOTER);
    } else if (this.tutorialState === TUT.L2_REFRESH_SUNFLOWER && seed === 1) {
      this.setTutorialState(TUT.L2_PICK_UP_SUNFLOWER);
    }
  }
  // Board::SetTutorialState (5676), L1/L2 branches (MORESUN 9-12 out of scope).
  setTutorialState(s) {
    const A = ADVICE_TEXT;
    switch (s) {
      case TUT.L1_PICK_UP_PEASHOOTER: // 1
        // NOTE: source shows the arrow at mSeedPackets[1] in UpdateTutorial
        // but packet[0] in SetTutorialState; L1's bank holds only the
        // peashooter, so both mean the pea packet — we always use slot 0.
        if (this.allPlants().length === 0) {
          this.displayAdvice(A.CLICK_SEED_PACKET, "L1stay");
          this.tutorialArrow = 0;
        } else {
          this.displayAdvice(A.ENOUGH_SUN, "L1stay");
          this.tutorialTimer = 400;
        }
        break;
      case TUT.L1_PLANT_PEASHOOTER: // 2
        this.tutorialTimer = -1;
        this.tutorialArrow = -1; // TutorialArrowRemove
        if (this.allPlants().length === 0) this.displayAdvice(A.CLICK_ON_GRASS, "L1stay");
        else this.clearAdvice(null); // ClearAdvice(ADVICE_NONE)
        break;
      case TUT.L1_REFRESH_PEASHOOTER: // 3
        this.displayAdvice(A.PLANTED_PEASHOOTER, "L1stay");
        this.sunCd = 400; // first sky sun 4s after the first planting
        break;
      case TUT.L1_COMPLETED: // 4
        this.displayAdvice(A.ZOMBIE_ONSLAUGHT, "L1");
        this.zombieCd = 99; this.zombieCdStart = 99;
        break;
      case TUT.L2_PICK_UP_SUNFLOWER: // 5
        this.tutorialArrow = 1; // sunflower slot in the L2 [pea, sun] bank
        break;
      case TUT.L2_PLANT_SUNFLOWER: // 6
      case TUT.L2_REFRESH_SUNFLOWER: // 7
        this.tutorialArrow = -1; // TutorialArrowRemove
        break;
      case TUT.L2_COMPLETED: // 8
        if (this.currentWave === 0) { this.zombieCd = 999; this.zombieCdStart = 999; }
        break;
      case TUT.SHOVEL_PICKUP: // 15
        // SetTutorialState 5747-5754: HINT_STAY advice + arrow at the shovel
        // button (centered -25, bottom -65). The pixel position is resolved
        // at draw time from the fixed shovel rect (see drawTutorialArrow).
        this.displayAdvice(A.CLICK_SHOVEL, "HINT");
        this.tutorialArrow = "shovel";
        break;
      case TUT.SHOVEL_DIG: // 16
        this.displayAdvice(A.CLICK_PLANT, "HINT");
        this.tutorialArrow = -1; // TutorialArrowRemove
        break;
      case TUT.SHOVEL_KEEP_DIGGING: // 17
        this.displayAdvice(A.KEEP_DIGGING, "HINT");
        break;
      case TUT.SHOVEL_COMPLETED: // 18
        // ClearAdvice(ADVICE_NONE) + rewind the intro so Dave re-enters and
        // talks 2410 (Board.cpp 5766-5770).
        // USER OVERRIDE: walnut bowling has no shovel — hide it once the
        // first-time L5 SHOVEL tutorial is done (retail keeps mShowShovel
        // from the 762-773 intro branch through play via ShowShovel's
        // bowling early-return). Intro-end ShowShovel keeps it hidden.
        if (this.isBowling) this.showShovel = false;
        this.clearAdvice(null);
        this.tutorialArrow = -1;
        if (this.cutscene) { this.cutscene.time = 1500; this.cutscene.daveDialogStart = 2410; }
        break;
      case TUT.WHACK_BEFORE_PICK_SEED: // 28
      case TUT.WHACK_PICK_SEED: // 29
        // Challenge::WhackAZombieUpdate does not set advice/arrow itself —
        // SetTutorialState just records the state; the seedbank flash (Draw
        // 640-646) and the PICK_SEED completion on plant (WasPlanted 845-848)
        // ride on the state value. Keep any current advice.
        this.tutorialArrow = -1;
        break;
      case TUT.WHACK_COMPLETED: // 30
        this.clearAdvice(null);
        this.tutorialArrow = -1;
        break;
    }
    this.tutorialState = s;
  }
  // Board::UpdateTutorial (5627), L1/L2 branches + Challenge::WhackAZombieUpdate (5275-5291).
  updateTutorial() {
    const A = ADVICE_TEXT;
    if (this.tutorialTimer > 0) this.tutorialTimer--;
    if (this.tutorialState === TUT.L1_PICK_UP_PEASHOOTER && this.tutorialTimer === 0) {
      this.displayAdvice(A.CLICK_PEASHOOTER, "L1stay");
      this.tutorialArrow = 0; // (see packet-slot note in setTutorialState)
      this.tutorialTimer = -1;
    } else if (this.tutorialState === TUT.L2_PICK_UP_SUNFLOWER ||
               this.tutorialState === TUT.L2_PLANT_SUNFLOWER ||
               this.tutorialState === TUT.L2_REFRESH_SUNFLOWER) {
      if (this.tutorialTimer === 0) {
        this.displayAdvice(A.PLANT_SUNFLOWER2, "L2");
        this.tutorialTimer = -1;
      } else if (this.zombieCd === 750 && this.currentWave === 0) {
        this.displayAdvice(A.PLANT_SUNFLOWER3, "L2");
      }
    } else if (this.isWhack) {
      this.whackUpdate();
    }
  }
  // Challenge::WhackAZombieUpdate (Challenge.cpp:5275-5291): once sun exists,
  // open the tutorial (BEFORE_PICK_SEED + 1500 timer); timer expiry advances
  // to PICK_SEED (+400); its expiry completes. Runs every play tick via
  // updateTutorial (same cadence as Board::UpdateTutorial).
  whackUpdate() {
    if (this.sun > 0 && this.tutorialState === TUT.OFF) {
      this.setTutorialState(TUT.WHACK_BEFORE_PICK_SEED);
      this.tutorialTimer = 1500;
    }
    if (this.tutorialState === TUT.WHACK_BEFORE_PICK_SEED && this.tutorialTimer === 0) {
      this.setTutorialState(TUT.WHACK_PICK_SEED);
      this.tutorialTimer = 400;
    }
    if (this.tutorialState === TUT.WHACK_PICK_SEED && this.tutorialTimer === 0) {
      this.setTutorialState(TUT.WHACK_COMPLETED);
    }
  }
  // Coin::MouseDown (1382): first sun collected on first-time L1.
  onSunCollected() {
    if (this.firstTime && this.level === 1) {
      this.displayAdvice(ADVICE_TEXT.CLICKED_ON_SUN, "L1stay", "CLICKED_ON_SUN");
    }
  }
  canPlant(c, r, seed, free = false) {
    const cell = this.cell(c, r);
    if (!cell) return false;
    // Challenge::CanPlantAt vase branch (2830-2833): never on a vase cell.
    if (this.isVase && this.vases.some((v) => v.col === c && v.row === r)) return false;
    // Wall-nut Bowling (Challenge::CanPlantAt 2452-2455): only columns 0-2
    // are past the bowling line. GetPlantsOnLawn returns empty on bowling
    // levels, so occupancy never blocks — any lane cell is plantable.
    if (this.isBowling) return c <= 2;
    // Conveyor packets are free and single-use (SeedPacket::CanPickUp 687
    // skips the sun check when HasConveyorBeltSeedBank; WasPlanted 859-862
    // removes the packet instead of recharging) — other conveyor levels
    // plant through the normal cell gates with no sun/recharge checks.
    // Vase usable seeds (MouseDownWithPlant 3948-3954) plant free the same
    // way: no sun cost, no recharge — only the cell gates apply.
    if (!free && !this.isConveyor && (this.sun < PLANTS[seed].cost || (this.recharge[seed] | 0) > 0)) return false;
    if (seed === 11) return cell.grave && !cell.base;     // gravebuster
    // Coffee (Board::CanPlantAt 2792-2806) runs BEFORE the grave/crater/
    // dirt/pool/roof gates: it plants ONLY onto a sleeping normal plant
    // whose wake-up isn't already pending (PLANTING_NEEDS_SLEEPING
    // otherwise), and never twice on one cell (mFlyingPlant) — even in bare
    // water on a sea-shroom, on a crater, or on roofless roof.
    // (Bungee-grab gate N/A — no bungee-carry in scope.)
    if (seed === 35) {
      const host = cell.base;
      return !cell.flying && !!(host && !host.dead && host.sleeping && host.wakeUpCd === 0);
    }
    // Board::CanPlantAt order after the coffee branch (2808-2838): grave,
    // crater, ice, then dirt. (Source checks the grave gate here; this
    // port's grave gates live below with the night/whack boards — same
    // verdicts in scope, since graves never share water/roof cells.)
    if (cell.crater) return false; // NOT_ON_CRATER (2826)
    if (this.isDirtRow(r)) return false; // GRIDSQUARE_DIRT (2834-2838)
    if (this.isIceAt(c, r)) return false; // no planting on ice (2830-2833)
    // Board::CanPlantAt: LILYPAD/TANGLEKELP/SEASHROOM plant ONLY on pool
    // squares (PLANTING_ONLY_IN_POOL) — lanes 2-3 of a pool/fog lawn.
    if ((seed === 16 || seed === 19 || seed === 24) && !this.isPoolSquare(c, r)) return false;
    if (this.isWaterRow(r)) {
      // Board::CanPlantAt pool branch: the lily goes on empty water; everything
      // else (tangle/sea-shroom + land plants) needs a live lily to sit on.
      if (seed === 16) return !cell.base && !cell.lily;
     // Board::CanPlantAt 2841-2849: LILYPAD/TANGLEKELP/SEASHROOM all share
     // one rule — pool square + NO normal plant + NO underplant. So tangle
     // (19) and sea-shroom (24) plant directly in EMPTY water: no lily
     // needed, and a lily blocks them (any underplant -> NOT_HERE).
     if (seed === 19 || seed === 24) return !cell.base && !cell.lily;
     // Board::CanPlantAt 2855-2861/2905-2909: spikeweed needs GROUND (a pool
     // square, even with a lily on it, reports NEEDS_GROUND) and potato mines
     // arm only on ground (aHasLilypad -> ONLY_ON_GROUND).
     if (seed === 21 || seed === 4) return false;
     // Board::CanPlantAt 2864/2872-2875: flowerpots never plant in pool —
     // bare water reports NOT_ON_WATER and a lily underneath reports
     // NOT_HERE, so there is no OK case.
     if (seed === 33) return false;
     if (!cell.lily || cell.lily.dead) return false;
     // Pumpkin on a lily pad follows the same shell-slot rule as on land
     // (Board.cpp:2882-2903 runs after the pool gate: an empty shell slot
     // plants freely even over an occupied host, and over an existing shell
     // only with First Aid + damage).
     if (seed === 30) {
       const shell = (cell.shell && !cell.shell.dead) ? cell.shell : null;
       if (!shell) return true;
       if (this.firstAid && shell.seed === 30 && shell.hp < Math.trunc(shell.maxHp * 2 / 3)) return true;
       return false;
     }
     return !cell.base;
   }
   if (this.bg === BG.ROOF || this.bg === BG.BOSS) {
     if (seed === 33) return !cell.pot && !cell.base && !(cell.shell && !cell.shell.dead);    // flowerpot first (2872-2875: normal/under/pumpkin all block; crater/ice/dirt gated above)
     if (seed === 21) return false; // NEEDS_GROUND (2855-2861, roof/pot branch)
     if (!cell.pot) return false;
     // Roof pumpkin needs its pot, then the same shell-slot rule as land.
     if (seed === 30) {
       const shell = (cell.shell && !cell.shell.dead) ? cell.shell : null;
       if (!shell) return true;
       if (this.firstAid && shell.seed === 30 && shell.hp < Math.trunc(shell.maxHp * 2 / 3)) return true;
       return false;
     }
      // Board::CanPlantAt wall-nut/tall-nut repair (2952-2959) applies on
      // potted roof cells too (the NEEDS_POT gate above only fires pot-less).
      if (seed === 3 || seed === 23) {
        const host = (cell.base && !cell.base.dead) ? cell.base : null;
        if (host && host.seed === seed && this.firstAid && host.hp < Math.trunc(host.maxHp * 2 / 3)) return true;
      }
     return !cell.base;
   }
    if (this.bg === BG.NIGHT || this.bg === BG.FOG) {
      // Board::CanPlantAt grave rule (Board.cpp:2807-2811): nothing else
      // plants on a grave (PLANTING_NOT_ON_GRAVE) — except flying coffee
      // (IsFlying, 2810), which plants normally.
      if (cell.grave && seed !== 11 && !Plant.isFlying(seed)) return false;
    }
    // Whack-a-Zombie day graves (Board.cpp:2807-2811 applies on every bg):
    // the whack lawn is DAY with graves, so the same grave gate runs here.
    if (this.isWhack && cell.grave && seed !== 11 && !Plant.isFlying(seed)) return false;
    // Board::CanPlantAt PUMPKINSHELL (Board.cpp:2882-2903): a cobcannon host
    // never takes one (no cobcannon seed in scope — no branch); an empty
    // shell slot plants freely, even on a bare cell with no host; over an
    // existing shell only with Wall-nut First Aid while it is damaged
    // (hp < max*2/3, float compare like source). Bungee-carry gate N/A.
    // Flowerpot (2872) refuses any occupied slot on every bg — the pool
    // branch above already refused water and the roof branch its own cells,
    // so only the shell needs covering here (under-plants can't share land
    // cells in scope).
    if (seed === 30) {
      const shell = (cell.shell && !cell.shell.dead) ? cell.shell : null;
      if (!shell) return true;
      if (this.firstAid && shell.seed === 30 && shell.hp < Math.trunc(shell.maxHp * 2 / 3)) return true;
      return false;
    }
   // Board::CanPlantAt wall-nut/tall-nut repair (2952-2959): a same-seed
   // damaged host + First Aid re-plants; otherwise the occupied cell below
   // refuses like any other normal seed.
   if (seed === 3 || seed === 23) {
     const host = (cell.base && !cell.base.dead) ? cell.base : null;
     if (host && host.seed === seed && this.firstAid && host.hp < Math.trunc(host.maxHp * 2 / 3)) return true;
   }
    // Board::CanPlantAt FLOWERPOT (2872): a pot refuses a shelled cell on
    // every bg — the pool branch above already refused water and the roof
    // branch its own cells (under-plants can't share land cells in scope).
    if (seed === 33 && cell.shell && !cell.shell.dead) return false;
   return !cell.base;
  }
  // Bowling plant (Board::MouseDownWithPlant 3955-3967 + AddPlant): the bowler
  // rolls from the grid corner, WasPlanted removes the conveyor packet, and
  // the bowling sfx plays (Board.cpp:4054-4056). No sun cost, no recharge.
  plantBowler(c, r, seed, convIdx) {
    if (!this.canPlant(c, r, seed)) return false;
    const bw = new Bowler(this, seed, c, r);
    this.bowlers.push(bw);
    if (convIdx !== undefined && convIdx !== null && convIdx >= 0) this.convRemoveSeed(convIdx);
    const dpx = gridToPixelX(c, this.bg) + 41;
    const dpy = gridToPixelY(c, r, this.bg) + 74;
    this.spawnDirt(dpx, dpy); this.sfx("bowling");
    return true;
  }
  plantAt(c, r, seed, convSlot = -1, free = false) {
    if (!this.canPlant(c, r, seed, free)) return false;
    const cell = this.cell(c, r);
    // Board::MouseDownWithPlant repair (Board.cpp:3906-3919): re-planting a
    // same-seed wall-nut/tall-nut/pumpkin over a damaged one kills the old
    // plant first (canPlant already gated this to First-Aid + damaged below
    // 2/3). The new plant takes the slot below.
    if ((seed === 3 || seed === 23) && cell.base && !cell.base.dead && cell.base.seed === seed) cell.base.dead = true;
    if (seed === 30 && cell.shell && !cell.shell.dead && cell.shell.seed === 30) cell.shell.dead = true;
    const p = new Plant(this, seed, c, r);
    if (seed === 35) cell.flying = p; // coffee stacks above the host (mFlyingPlant)
    else if (seed === 30) cell.shell = p;
    else if (seed === 16) cell.lily = p;
    else if (seed === 33) cell.pot = p;
    else cell.base = p;
    // (Board::AddPlant sets no countdowns — PlantInitialize's 50-tick blover
    // fuse and magnet's 1500-tick steal countdown ride the ctor/attract
    // paths, respectively.)
    if (this.isConveyor) {
      // SeedPacket::WasPlanted (859-862): conveyor packets are consumed, not
      // recharged — and cost nothing (CanPickUp 687).
      if (convSlot >= 0) this.convRemoveSeed(convSlot);
    } else if (!free) {
      this.sun -= PLANTS[seed].cost;
      this.recharge[seed] = PLANTS[seed].refresh;
    } else {
      // Vase usable-seed planting (MouseDownWithPlant 3948-3954): the coin
      // dies with no sun cost and no recharge (the caller kills the coin).
    }
    // Board::DoPlantingEffects (Board.cpp:0x40CE60): burst origin
    // GridToPixel + (41,74), +15 for lily, +30 for pot, at RENDER_LAYER_TOP.
    // GREENHOUSE (ceramic) / ZOMBIQUARIUM branches N/A (no such bgs here);
    // flying plants (IsFlying = coffee only) play the sfx with no burst;
    // pool squares burst PARTICLE_PLANTING_POOL (same origin).
    const dpx = gridToPixelX(c, this.bg) + 41;
    let dpy = gridToPixelY(c, r, this.bg) + 74;
    if (seed === 16) dpy += 15; else if (seed === 33) dpy += 30;
    if (seed === 35) this.sfx(Math.random() < 0.5 ? "plant" : "plant2");
    else if (this.isWaterRow(r)) { this.spawnDirt(dpx, dpy, true); this.sfx("plantWater"); } // FOLEY_PLANT_WATER (TodFoley.cpp:62, flat) + PARTICLE_PLANTING_POOL
    else { this.spawnDirt(dpx, dpy); this.sfx(Math.random() < 0.5 ? "plant" : "plant2"); } // FOLEY_PLANT = {SOUND_PLANT, SOUND_PLANT2} (TodFoley.cpp)
    // Tutorial planting transitions (Board.cpp:4002-4033, L1/L2 only).
    if (this.tutorialState === TUT.L1_PLANT_PEASHOOTER) {
      this.setTutorialState(this.allPlants().length >= 2 ? TUT.L1_COMPLETED : TUT.L1_REFRESH_PEASHOOTER);
    } else if (this.tutorialState === TUT.L2_PLANT_SUNFLOWER) {
      const suns = this.countSeedPlants(1); // CountSunFlowers
      if (seed === 1 && suns === 2) {
        this.displayAdvice(ADVICE_TEXT.MORE_SUNFLOWERS, "L2");
        this.setTutorialState(this.canPickUpSeed(1) ? TUT.L2_PICK_UP_SUNFLOWER : TUT.L2_REFRESH_SUNFLOWER);
      } else if (suns >= 3) {
        this.setTutorialState(TUT.L2_COMPLETED);
      } else {
        this.setTutorialState(this.canPickUpSeed(1) ? TUT.L2_PICK_UP_SUNFLOWER : TUT.L2_REFRESH_SUNFLOWER);
      }
    } else if (this.tutorialState === TUT.WHACK_PICK_SEED || this.tutorialState === TUT.WHACK_BEFORE_PICK_SEED) {
      // SeedPacket::WasPlanted whack branch (SeedPacket.cpp:845-848).
      this.setTutorialState(TUT.WHACK_COMPLETED);
    }
    // Successful-plant advice clear (Board.cpp:3857-3880): every planting
    // hint is wiped so a stale ON_WATER/grave/crater note can't linger under
    // the new plant. Scoped to the hint keys this port defines (upgrade/
    // NEED_POT/WRONG_ART branches are out of scope — no imitater mode or
    // roof/boss boards in 1-9).
    for (const k of ["LILYPAD_ON_WATER", "TANGLEKELP_ON_WATER", "SEASHROOM_ON_WATER", "GRAVEBUSTERS_ON_GRAVES", "PLANT_NOT_ON_GRAVE", "PLANT_NOT_ON_CRATER", "CANT_PLANT_THERE", "PLANTING_NEED_SLEEPING", "PLANT_NEED_POT1", "PLANT_NEED_POT2", "PLANTING_NEEDS_GROUND", "POTATO_MINE_ON_LILY"]) this.clearAdvice(k);
    return true;
  }
  // Board::ToolHitTest (Board.cpp:4118) + MouseHitTestPlant (4169) +
  // SpecialPlantHitTest (4142): pixel-space shovel targeting. Pumpkin shell
  // only via the proximity ring (25-50px when a live normal plant shares
  // the cell, else 0-50px, click below mY+25); flying coffee within 15px of
  // (mX+40, mY); otherwise the cell's TOPPLANT_DIGGING_ORDER top (base, else
  // lily/pot — never shell), except a lily/pot under a pumpkin is
  // untouchable. Gravebuster excluded (ToolHitTestHelper, non-zen).
  // Bowling returns null outside the shovel tutorial (GetPlantsOnLawn +
  // GetTopPlantAt gates) — rollers are NOT shovellable. NotOnGround
  // (squash mid-jump / bungee / squished) has no in-scope setters, so only
  // dead plants are skipped.
  toolHitTest(px, py) {
    const shovTut = this.tutorialState === TUT.SHOVEL_PICKUP || this.tutorialState === TUT.SHOVEL_DIG || this.tutorialState === TUT.SHOVEL_KEEP_DIGGING;
    if (this.isBowling && !shovTut) return null;
    for (const p of this.allPlants()) {
      if (p.seed === 30) { // SEED_PUMPKINSHELL proximity ring
        const cell = this.cell(p.col, p.row);
        const minDist = (cell && cell.base && !cell.base.dead) ? 25 : 0;
        const d = Math.hypot(px - (p.x + 40), py - (p.y + 40));
        if (d >= minDist && d <= 50 && py > p.y + 25) return p;
      } else if (p.seed === 35) { // SEED_INSTANT_COFFEE: Plant::IsFlying (only flying seed)
        if (Math.hypot(px - (p.x + 40), py - p.y) < 15) return p;
      }
    }
    const g = pixelToGrid(px, py, this.bg);
    const cell = this.cell(g.col, g.row);
    if (!cell) return null;
    if (cell.base && !cell.base.dead) return cell.base.seed === 11 ? null : cell.base; // gravebuster undiggable
    const under = (cell.lily && !cell.lily.dead) ? cell.lily : ((cell.pot && !cell.pot.dead) ? cell.pot : null);
    if (under && cell.shell && !cell.shell.dead) return null; // lily/pot under a pumpkin is untouchable (4199-4206)
    return under;
  }
  // Board::MouseDownWithTool shovel branch (4123-4137): digs the ToolHitTest
  // plant (Die, no loot; tutorial by peashooter count). Sound is
  // FOLEY_USE_SHOVEL = SOUND_PLANT2, flat (TodFoley.cpp:18).
  digAt(px, py) {
    const hit = this.toolHitTest(px, py);
    if (!hit) return null;
    hit.dead = true; this.sfx("plant2"); this.plantsShoveled++;
    if (this.tutorialState === TUT.SHOVEL_DIG || this.tutorialState === TUT.SHOVEL_KEEP_DIGGING) {
      this.setTutorialState(this.countSeedPlants(0) === 0 ? TUT.SHOVEL_COMPLETED : TUT.SHOVEL_KEEP_DIGGING);
    }
    return hit;
  }
  // Board::UpdateMousePosition shovel branch (3232-3244) +
  // HighlightPlantsForMouse (3146): while a tool cursor is armed, the
  // ToolHitTest plant glows (mHighlighted -> additive redraw in
  // Plant::UpdateReanimColor/Draw). Cleared every call first.
  updateHighlight(px, py, toolActive) {
    for (const p of this.allPlants()) p.highlighted = false;
    if (!toolActive) return;
    const hit = this.toolHitTest(px, py);
    if (hit) hit.highlighted = true;
  }
  // ----- spawning (Board::PickRowForNewZombie/SpawnZombieWave/AddZombie) -----
  // Board::RowCanHaveZombieType (Board.cpp:2540): dirt never; pool rows only
  // for pool-capable types (pool-only types never elsewhere, and pool rows
  // take only pool-only types for the first 5 waves); roof land rejects
  // nothing (no high-ground rows in adventure); bobsled needs row ice;
  // garg never row 0; dancer needs neighbors unless the stage has a pool.
  rowCanHaveZombieType(type, row) {
    if (row < 0 || row >= this.rows) return false; // RowCanHaveZombies rejects off-board rows (dancer slots probe row-1/+1)
    if (this.isDirtRow(row)) return false; // RowCanHaveZombies
    if (this.isWaterRow(row)) {
      if (!POOL_OK.has(type)) return false;
      if (this.currentWave < 5 && !POOL_ONLY.has(type)) return false;
    } else if (POOL_ONLY.has(type)) return false;
    if (type === "bobsled" && !this.iceTimer[row]) return false;
    if (row === 0 && type === "garg") return false; // non-survival
    if (type === "dancer" && !this.stageHasPool()) {
      if (row - 1 < 0 || row + 1 >= this.rows) return false;
      if (this.isDirtRow(row - 1) || this.isDirtRow(row + 1)) return false;
    }
    return true;
  }
  stageHasPool() { return this.bg === BG.POOL || this.bg === BG.FOG; }
  // Pool water tick (Board::Update 5917-5926 + PoolEffect::PoolEffectUpdate):
  // the water counter advances every board tick on pool/fog stages except
  // during the loss walk-in (SCENE_ZOMBIES_WON) and the ice trap (which also
  // freezes the sparkles — thaw resumes them, 5807-5814). Day-pool (bg 3)
  // additionally feeds the two looping POOL_SPARKLY emitters at (450,295).
  // Called from updateFx (every sim tick) and directly from the main
  // cutscene tick (the sim clock doesn't run there, but retail's Board::
  // Update — and the water — runs through the intro too).
  tickPoolFx() {
    if (!this.stageHasPool() || (this.iceTrapCounter | 0) > 0 || this.state === "lost") return;
    this.poolCounter++;
    if (this.bg !== BG.POOL) return; // sparkles are a BACKGROUND_3_POOL exclusive (5922)
    if (this.sparkles.length < 600) {
      for (let i = 0; i < POOL_SPARKLY.length; i++) {
        const d = POOL_SPARKLY[i];
        this.poolAcc[i] += d.rate / 100; // SpawnRate is per-second at 100tps
        let n = Math.floor(this.poolAcc[i]);
        this.poolAcc[i] -= n;
        while (n-- > 0) {
          const rx = d.boxX[0] + Math.random() * (d.boxX[1] - d.boxX[0]);
          const ry = d.boxY[0] + Math.random() * (d.boxY[1] - d.boxY[0]);
          const dur = d.dur[0] + Math.random() * (d.dur[1] - d.dur[0]);
          this.sparkles.push({
            x: 450 + rx + (d.skewX || 0) * ry, // EmitterSkewX slants x with y
            y: 295 + ry,
            vx: (d.velX[0] + Math.random() * (d.velX[1] - d.velX[0])) / 100,
            vy: (d.velY[0] + Math.random() * (d.velY[1] - d.velY[0])) / 100,
            age: 0, dur, interp: Math.random(), def: i, sc: 0.3,
          });
        }
      }
    }
    for (const m of this.sparkles) {
      m.x += m.vx; m.y += m.vy; m.age++;
      m.sc = evalPowieTrack(POOL_SPARKLY[m.def].scaleN, m.age / m.dur, m.interp);
    }
    this.sparkles = this.sparkles.filter((m) => m.age < m.dur);
  }
  // Board::PickRowForNewZombie (Board.cpp:2601): the attracting rake claims
  // the next zombie of a row it can take (state -> WAITING +
  // TodUpdateSmoothArrayPick on its row), else smooth-array pick over
  // eligible rows; rows
  // mowed within the last wave get ~0 weight (mWaveRowGotLawnMowered).
  pickRow(type) {
    const rk = this.rake;
    if (rk && rk.state === "attracting" && this.rowCanHaveZombieType(type, rk.row)) {
      rk.state = "waiting"; // GRIDITEM_STATE_RAKE_WAITING
      // TodUpdateSmoothArrayPick (TodCommon.cpp:231): bump picked rows,
      // park the pick (second = last, last = 0).
      for (const e of this.rowPickingArray) if (e.w > 0) { e.last += 1; e.second += 1; }
      const pick = this.rowPickingArray[rk.row];
      if (pick) { pick.second = pick.last; pick.last = 0; }
      return rk.row;
    }
    const arr = this.rowPickingArray;
    for (let r = 0; r < this.rows; r++) {
      if (!this.rowCanHaveZombieType(type, r)) arr[r].w = 0;
      else {
        const since = this.currentWave - this.waveRowMowed[r];
        arr[r].w = since <= 1 ? 0.01 : since <= 2 ? 0.5 : 1;
      }
    }
    // TodPickFromSmoothArray asserts a nonzero total (retail crashes here);
    // fall back to the first eligible row (or the middle lane) instead.
    if (!arr.some((e) => e.w > 0)) {
      for (let r = 0; r < this.rows; r++) if (this.rowCanHaveZombieType(type, r)) return r;
      return Math.floor(this.rows / 2);
    }
    return smoothPick(arr, Math.random);
  }
  canAddBobSled() { // Board::CanAddBobSled (2661): ice sheet reaching in
    for (let r = 0; r < this.rows; r++) if (this.iceTimer[r] > 0 && this.iceMinX[r] < 700) return true;
    return false;
  }
  spawnZombie(type, row, wave, xOff) {
    // Board::AddZombieInRow (2674): variant handled in the constructor;
    // a bobsled team is a leader + 3 related followers in the same row
    // (the followers carry no sled pool — the leader holds the 300 helm).
    if (type === "bobsled") {
      const rr = row === undefined ? this.pickRow(type) : row;
      const leader = new Zombie(this, "bobsled", rr, wave);
      if (xOff !== undefined) leader.x = xOff;
      leader.y = zombieRowY(this.bg, leader.x, rr, "bobsled");
      this.zombies.push(leader);
      const ALTS = [9, -7, 9];
      for (let i = 0; i < 3; i++) {
        const z = new Zombie(this, "bobsled", rr, wave);
        z.helm = 0; z.helmMax = 0; // followers ride, only the leader holds the sled
        z.parent = leader;
        z.x = (xOff !== undefined ? xOff : leader.x) + (i + 1) * 50;
        z.y = zombieRowY(this.bg, z.x, rr, "bobsled");
        z.altitude = ALTS[i];
        z.phase = "sliding"; z.phaseT = 500;
        z.variant = false;
        z.playZombie("anim_push", LOOP, 0, 30);
        this.zombies.push(z);
      }
      return leader;
    }
    const z = new Zombie(this, type, row === undefined ? this.pickRow(type) : row, wave);
    if (xOff !== undefined) z.x = xOff;
    this.zombies.push(z);
    if (type === "digger") { z.digging = true; z.digCd = 500; z.hasObject = true; z.phase = "tunnel"; }
    // Zombie::PlayZombieAppearSound (Zombie.cpp:235960): only dolphin,
    // balloon and zamboni play an appear foley — balloon's is
    // FOLEY_BALLOONINFLATE (pitch 10, TodFoley table).
    if (type === "dolphin") this.sfx("dolphinAppears"); // FOLEY_DOLPHIN_APPEARS (7388)
    if (type === "balloon") this.sfx("ballooninflate"); // FOLEY_BALLOONINFLATE
    if (type === "zamboni") this.sfx("zamboni");
    return z;
  }
  bungeeDropZombie(type, col, row) {
    // Board::BungeeDropZombie (Board.cpp:4906): a carrier bungee flies the
    // zombie to the grid. The carrier dives at the assigned cell (cargo
    // linked both ways); the rider dangles frozen (idle @0, x-15, drawn by
    // the carrier) until the landing release walks it.
    const bz = new Zombie(this, "bungee", row, this.currentWave);
    bz.dead = false; bz.gone = false; // ctor pick may have died on a thin lawn — the blitz grid always lands
    bz.bungeeCell = { col, row }; bz.row = row;
    bz.x = gridToPixelX(col, this.bg); bz.y = zombieRowY(this.bg, bz.x, row, "bungee");
    bz.playZombie("anim_raise", PLAY_ONCE_AND_HOLD, 0, 36);
    this.zombies.push(bz);
    const z = new Zombie(this, type, this.pickRow(type), this.currentWave);
    z.held = true; z.carrier = bz; bz.cargo = z;
    z.x = bz.x - 15; z.y = bz.y;
    if (z.body.trackExists("anim_idle")) z.playZombie("anim_idle", LOOP, 0, 0);
    z.body.animRate = 0; // frozen dangle (startWalkAnim re-rates on release)
    this.zombies.push(z);
    return z;
  }
  spawnWave() {
    // Board::SpawnZombieWave (Board.cpp:5030).
    if (this.level === 45) { // IsBungeeBlitzLevel: sky drops (SetupBungeeDrop grid)
      const grid = [];
      for (let gx = 4; gx < 9; gx++) for (let gy = 0; gy <= 4; gy++) grid.push([gx, gy]);
      for (const t of this.waves[this.currentWave] || []) {
        if (t === "ZOMBIE_INVALID") break;
        if (t === "bungee" || t === "zamboni") this.spawnZombie(t, undefined, this.currentWave);
        else {
          const g = grid.splice(Math.floor(Math.random() * grid.length), 1)[0] || [8, 2];
          this.bungeeDropZombie(t, g[0], g[1]);
        }
      }
    } else {
      for (const t of this.waves[this.currentWave] || []) {
        if (t === "bungee") { this.spawnZombie("bungee", undefined, this.currentWave); continue; }
        // BOBSLED with no ice on the board arrives as 4 normals instead.
        if (t === "bobsled" && !this.canAddBobSled()) {
          for (let i = 0; i < 4; i++) this.spawnZombie("normal", undefined, this.currentWave);
          continue;
        }
        this.spawnZombie(t, undefined, this.currentWave);
      }
    }
    if (this.currentWave === this.numWaves - 1) this.riseCounter = 200; // mRiseFromGraveCounter
    if (this.isFlagWave(this.currentWave)) this.flagT = 120;
    if (this.isFlagWave(this.currentWave)) this.flagRaise = 100; // flag poles fly up
    this.currentWave++;
  }
  // Plant::GetTopPlantAt BUNGEE_ORDER (Board.cpp:2265-2271): flying ->
  // normal (base) -> pumpkin (shell) -> under (pot/lily). A lone pot/lily
  // with nothing above it is a valid steal (bare pre-potted roof cols).
  topBungeePlant(c, r) {
    const cell = this.cell(c, r);
    if (!cell) return null;
    if (cell.flying && !cell.flying.dead) return cell.flying;
    if (cell.base && !cell.base.dead) return cell.base;
    if (cell.shell && !cell.shell.dead) return cell.shell;
    if (cell.pot && !cell.pot.dead) return cell.pot;
    if (cell.lily && !cell.lily.dead) return cell.lily;
    return null;
  }
  // Board::CountSunFlowers (Board.cpp:2286): MakesSun plants on the lawn.
  countSunFlowers() {
    let n = 0;
    for (const p of this.allPlants()) if (Plant.makesSun(p.seed)) n++;
    return n;
  }
  // Board::CountBungeesTargetingSunFlowers (Board.cpp:2310): live bungees
  // whose target cell's top plant makes sun. Feeds the pick mercy rule.
  countBungeesTargetingSunFlowers() {
    let n = 0;
    for (const z of this.zombies) {
      if (z.dead || z.gone || z.type !== "bungee" || !z.bungeeCell) continue;
      const p = this.topBungeePlant(z.bungeeCell.col, z.bungeeCell.row);
      if (p && Plant.makesSun(p.seed)) n++;
    }
    return n;
  }
  // Board::BungeeIsTargetingCell (Board.cpp:9577): another live bungee
  // already diving at this cell.
  bungeeIsTargetingCell(x, y) {
    for (const z of this.zombies) {
      if (z.dead || z.gone || z.type !== "bungee" || !z.bungeeCell) continue;
      if (z.bungeeCell.col === x && z.bungeeCell.row === y) return true;
    }
    return false;
  }
  // Board::FindUmbrellaPlant (Board.cpp:9605): a grounded umbrella leaf in
  // the 3x3 around (col,row). (Replaces the old umbrellaNear 3x3 scan — the
  // NotOnGround gate is new: carried/flattened leaves don't block.)
  findUmbrellaPlant(c, r) {
    for (const p of this.allPlants()) {
      if (p.seed !== 37 || p.notOnGround()) continue;
      if (Math.abs(p.col - c) <= 1 && Math.abs(p.row - r) <= 1) return p;
    }
    return null;
  }
  // FOLEY_BUNGEE_SCREAM set-pick (TodFoley.cpp:54): three scream variants,
  // uniform. Pitch 2.0 (audio.js PITCH table).
  bungeeScreamPick() {
    const r = Math.floor(Math.random() * 3);
    return r === 0 ? "bungeeScream" : r === 1 ? "bungeeScream2" : "bungeeScream3";
  }
  // Umbrella block burst (Projectile::DoImpact 592-594: PARTICLE_UMBRELLA_
  // REFLECT at mPosX+20/mPosY+20, RENDER_LAYER_TOP). The compiled
  // UmbrellaReflect.xml is a single basketball-art emitter; the port plays
  // one blotch + shards through the shared splat renderer (same centered,
  // rotated, scaled normal-blend path as the other splats in main.js).
  spawnUmbrellaReflect(x, y) {
    const R = Math.random;
    const blotch = { z: null, ox: x, oy: y, dx: 0, dy: 0, vx: 0, vy: 0, age: 0, dur: 35, img: "umbrellaReflect", frames: 1, frame: 0, rot: R() * Math.PI * 2, spin: 0, sc: [[0, 1]], al: [[0, 1], [0.9, 1], [1, 0]], grav: 0, dragAt: 2, drag: 0 };
    this.splats.push(blotch);
    const n = 6 + Math.floor(R() * 5);
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, rr = R() * 10;
      const sp = 0.5 + R() * 1.0;
      this.splats.push({
        z: null, ox: x, oy: y, dx: Math.sin(a) * rr, dy: Math.cos(a) * rr,
        vx: Math.sin(a) * sp, vy: Math.cos(a) * sp, age: 0, dur: 30,
        img: "umbrellaReflect", frames: 1, frame: 0,
        rot: R() * Math.PI * 2, spin: (R() * 400 - 200) * 0.01 * Math.PI / 180,
        sc: [[0, 0.5 + R() * 0.3]], al: [[0, 1], [0.8, 1], [1, 0]],
        grav: 0.1, dragAt: 0.4, drag: 0.1,
      });
    }
  }
  // ----- combat -----
  addProj(o) { this.projs.push(new Proj(this, o)); }
  // Plant::Fire lobbed branch (Plant.cpp:4727-4769): per-seed origin, lead by
  // ZombieTargetLeadX(50) with pogo/dolphin/snorkel adjustments, 40px
  // minimum range, 120-tick physics arc (velX = range/120, velZ =
  // rangeY/120 - 7, accZ 0.115). Range flags are the pult 13.
  addLob(plant, target, type, dmg, stun = false, splash = false) {
    let ox, oy;
    if (type === "cabbage") { ox = plant.x + 5; oy = plant.y - 12; }
    else if (type === "melon") { ox = plant.x + 25; oy = plant.y - 46; }
    else if (type === "kernel") { ox = plant.x + 19; oy = plant.y - 37; }
    else { ox = plant.x + 12; oy = plant.y - 56; } // butter
    // Plant::Fire (Plant.cpp:4703-4706): a potted pult lobs 5px lower — the
    // shot leaves from the raised pot, like the pea muzzles.
    try { if (plant.col >= 0 && this.cell(plant.col, plant.row).pot) oy -= 5; } catch (e) { /* headless: no cells */ }
    let rangeX, rangeY;
    if (target) {
      const zr = target.zombieRect();
      rangeX = target.zombieTargetLeadX(50) - ox - 30;
      rangeY = zr.y - oy;
      if (target.phase === "ride") rangeX -= 60; // PHASE_DOLPHIN_RIDING (the port's dolphin jump phase)
      if (target.type === "pogo" && target.hasObject) rangeX -= 60;
      if (target.type === "snorkel" && target.phase === "poolwalk") rangeX -= 40;
      if (target.type === "boss") rangeY = gridToPixelY(8, plant.row, this.bg) - oy;
    } else { rangeX = 700 - ox; rangeY = 0; }
    if (rangeX < 40) rangeX = 40;
    const col = Math.max(0, Math.min(8, Math.floor((ox - lawnXMin(this.bg)) / cellW(this.bg))));
    // ProjectileInitialize rotation (Projectile.cpp:79-93): cabbage/butter
    // ride -50.4deg spinning -0.08..-0.02/tick, melons -72deg on the same
    // spin band, kernels start flat on a faster -0.2..-0.08 spin.
    let rot = 0, rotSpeed = 0;
    if (type === "cabbage" || type === "butter") { rot = -7 * Math.PI / 25; rotSpeed = -0.08 + Math.random() * 0.06; }
    else if (type === "melon") { rot = -2 * Math.PI / 5; rotSpeed = -0.08 + Math.random() * 0.06; }
    else if (type === "kernel") { rot = 0; rotSpeed = -0.2 + Math.random() * 0.12; }
    this.lobs.push({
      x: ox, sx: ox, sy: oy, y: oy, z: 0, tx: ox + rangeX, row: plant.row,
      t: 0, age: 0, velX: rangeX / 120, velZ: rangeY / 120 - 7, accZ: 0.115,
      type, dmg, stun, splash, dead: false, img: this.projImage(type),
      rangeFlags: 13, shadowY: gridToPixelY(col, plant.row, this.bg) + 67,
      rot, rotSpeed, // mRotation/mRotationSpeed (ProjectileInitialize 79-93)
    });
    this.sfx(this.throwPick()); // Plant::Fire (4588): pults throw too
  }
  aoe(row, x, rowRange, radius, dmg, flags = 1) {
    for (const z of this.zombies) {
      if (z.dead || z.phase === "tunnel") continue;
      if (Math.abs(z.row - row) > rowRange) continue;
      if (Math.abs(z.hitCX() - x) > radius + 40) continue;
      z.damage(dmg, this, flags);
    }
  }
  // Board::KillAllZombiesInRadius (Board.cpp:9713): EffectedByDamage-gated,
  // circle-vs-rect overlap (GetCircleRectOverlap: inside both spans, else
  // corner Pythagoras, else single-axis distance), boss ignores the row
  // band, burn ? ApplyBurn : TakeDamage(1800, 18U). Ladders on the ground
  // die in range (9754) — unmodeled here (this port has no grid items;
  // ladder zombies only carry the shield), noted.
  killAllZombiesInRadius(row, x, y, radius, rowRange, burn, rangeFlags) {
    for (const z of this.zombies) {
      if (z.dead || z.gone) continue;
      if (!z.effectedByDamage(rangeFlags)) continue;
      const rowDist = z.type === "boss" ? 0 : z.row - row;
      if (rowDist > rowRange || rowDist < -rowRange) continue;
      const r = z.zombieRect();
      let dx = 0, dy = 0, xOut = false, yOut = false;
      if (x < r.x) { xOut = true; dx = r.x - x; }
      else if (x > r.x + r.w) { xOut = true; dx = x - r.x - r.w; }
      if (y < r.y) { yOut = true; dy = r.y - y; }
      else if (y > r.y + r.h) { yOut = true; dy = y - r.y - r.h; }
      let hit;
      if (!xOut && !yOut) hit = true;
      else if (xOut && yOut) hit = dx * dx + dy * dy <= radius * radius;
      else if (xOut) hit = dx <= radius;
      else hit = dy <= radius;
      if (!hit) continue;
      if (burn) z.applyBurn();
      else z.takeDamage(1800, DMG_HITS_BOTH | DMG_NOLEAVE);
    }
  }
  burnRow(row) {
    // Plant::BurnRow (Plant.cpp:4272): RemoveColdEffects + ApplyBurn for
    // same-row (or boss, any row) effected zombies (range flags = the
    // jalapeno's own 127), ladders in the row die (unmodeled, no grid
    // items), boss iceballs in the row shatter (unmodeled, no boss).
    // (The old direct 1800-damage played the normal death anim — retail
    // burns: victims char or freeze black, never anim_death.)
    for (const z of this.zombies) {
      if (z.dead || z.gone) continue;
      if (z.type !== "boss" && z.row !== row) continue;
      if (!z.effectedByDamage(127)) continue;
      z.removeColdEffects();
      z.applyBurn();
    }
  }
  // Board::DoFwoosh (Board.cpp:0x41D450): the jalapeno fire trail — 12
  // REANIM_JALAPENO_FIRE reanims across the row at x = 750*i/11+10,
  // y = GetPosYBasedOnRow(x+10, row)-10, anim_flame LOOP_FULL_LAST_FRAME at
  // the def rate x RandRangeFloat(0.7, 1.3), OverrideScale(Rand(0.9,1.1) x
  // a random x-flip, 1), stored per row; mFwooshCountDown = 100. Render
  // order is MakeRenderOrder(PARTICLE, row, 1) — above the row's zombies,
  // husks and mowers, below the next row (drawn in the row pass).
  doFwoosh(row) {
    for (let i = 0; i < 12; i++) {
      try {
        const fx = this.makeReanim("fire", (750 * i) / 11 + 10, posYOnRow(this.bg, (750 * i) / 11 + 10 + 10, row) - 10);
        fx.playReanim("anim_flame", LOOP_FULL_LAST_FRAME, 0, 0); // keep the def rate, then jitter it
        fx.animRate *= 0.7 + Math.random() * 0.6; // RandRangeFloat(0.7, 1.3)
        const s = 0.9 + Math.random() * 0.2; // RandRangeFloat(0.9, 1.1)
        fx.setScale(Math.random() < 0.5 ? -s : s, 1); // OverrideScale(s*flip, 1)
        this.fwoosh.push({ body: fx, row, i });
      } catch (e) { /* def missing: that flame is skipped, the burn still applies */ }
    }
    this.fwooshCd = 100;
  }
  // Board::UpdateFwoosh (Board.cpp:0x41D630): the countdown ticks down; the
  // surviving count follows TodAnimateCurve(50, 0, cd, 12, 0, LINEAR) — all
  // 12 flames burn while cd > 50, then they flip to anim_done @15
  // PLAY_ONCE_FULL_LAST_FRAME front (i = 0) to back as cd runs 50 -> 0
  // (TodAnimateCurveFloat warps (cd-50)/(0-50) clamped 0..1, so remaining =
  // round(12*(50-cd)/50)). Flipping nulls the ID (f.done here), so each
  // flame flips once; the done anim retires the reanim, swept in updateFx.
  updateFwoosh() {
    if (this.fwooshCd <= 0) return;
    const cd = --this.fwooshCd;
    const warped = (cd - 50) / (0 - 50);
    const remaining = warped <= 0 ? 12 : warped >= 1 ? 0 : Math.round(12 * (1 - warped));
    for (const f of this.fwoosh) {
      if (f.done || f.i >= 12 - remaining) continue;
      f.done = true; // mFwooshID[row][i] = NULL
      f.body.playReanim("anim_done", PLAY_ONCE_FULL_LAST_FRAME, 0, 15);
    }
  }
  areaDamage(row, x, range, dmg) {
    // Plant::DoRowAreaDamage (Plant.cpp:655) for the fume cone (Fire 4526:
    // DoRowAreaDamage(20, 2U)): same-row effected zombies (range flags 9)
    // with STRICTLY positive rect overlap (> 0, not >= 0), taking the damage
    // with DAMAGE_HITS_SHIELD_AND_BODY. High-ground match skipped (no roof).
    // Per-zombie FOLEY_SPLAT (Plant.cpp:694, inside the hit loop).
    const RF = Plant.damageRangeFlags(10, 0);
    for (const z of this.zombies) {
      if (z.dead || z.gone || z.mowed || z.row !== row) continue;
      if (!z.effectedByDamage(RF)) continue;
      const zr = z.zombieRect();
      if (getRectOverlap(x, range, zr.x, zr.w) > 0) {
        z.takeDamage(dmg, DMG_HITS_BOTH);
        this.sfx("splat"); // FOLEY_SPLAT per zombie hit (694)
      }
    }
  }
  addSun(x, y, kind = "sun") { this.coins.push(new Coin(this, kind, x, y, "plant")); }
  addCoin(x, y, kind, motion = "coin") { this.coins.push(new Coin(this, kind, x, y, motion)); }
  // Plant::KillAllPlantsNearDoom (Plant.cpp:4324): kills EVERY plant on the
  // same col+row — the doom-shroom's own cell included (the source loop
  // hits the detonating plant too; it Dies right after anyway).
  killAllPlantsNearDoom(c, r) {
    for (const p of this.allPlants()) {
      if (!p.dead && p.col === c && p.row === r) p.die();
    }
  }
  // Board::KillAllPlantsInRadius (Board.cpp): circle-vs-plant-rect kill for
  // the jack blast. GetPlantRect (Plant.cpp:5179): (mX+10, mY, mW-20, mH)
  // except tallnut (mX+10, full width), pumpkin (mX, mW-20) and cobcannon
  // (140x80 — no cob in scope, noted). mPlantsEaten++ per kill is untracked
  // here like the doom path (no reader in the port).
  killAllPlantsInRadius(x, y, radius) {
    for (const p of this.allPlants()) {
      if (p.dead) continue;
      let rx = p.x + 10, rw = p.w - 20;
      if (p.seed === 23) { rx = p.x + 10; rw = p.w; } // SEED_TALLNUT
      else if (p.seed === 30) { rx = p.x; rw = p.w - 20; } // SEED_PUMPKINSHELL
      if (circleRectOverlap(x, y, radius, { x: rx, y: p.y, w: rw, h: p.h })) p.die();
    }
  }
  // Board::AddACrater (Board.cpp:457) + the DoSpecial call site (Plant.cpp:
  // 4375): the crater's mGridItemCounter = 18000 ticks; UpdateGridItems
  // (Board.cpp:9675) counts it down on SCENE_PLAYING ticks only and
  // GridItemDies at 0. The old boolean never expired — now a real timer.
  addCrater(c, r) { const cell = this.cell(c, r); if (cell) cell.crater = 18000; }
  flashAt(x, y, r, fire = false) { this.flashes.push({ x, y, r, t: 25, fire }); }
  // Potato DoSpecial blast entry (PARTICLE_POTATO_MINE at the plant center,
  // RENDER_LAYER_PARTICLE): the user's own compiled/particles/PotatoMine.xml
  // (main.zip — decoded 0xDEADFED4+zlib container, byte-exact parse verified
  // against the PeaSplat twin) is a SINGLE animated-strip emitter, exactly
  // like their PeaSplat: IMAGE_SPUDOW (particles/spudow.png, 14 uniform cels
  // of 205x222 — SPUDOW! word with the dirt plume rising over it), Box type,
  // SystemDuration/ParticleDuration 85, SpawnMinActive/MaxLaunched 1,
  // EmitterOffsetY -50, ParticleAlpha hold-1-to-90%-then-fade, scale 1,
  // AnimationRate 1.2. Retail's 5-emitter PotatoMine.xml (Mashed/LowParts/
  // HighParts/Word/Flash) is superseded by the user's baked strip — same
  // relationship as PeaSplat vs the retail splat model. The mote below
  // mirrors the pea-splat mote shape so tick/render stay identical.
  potatoBlast(x, y) {
    this.potatoBlasts.push({
      x, y: y - 50, age: 0, dur: 85,
      img: "spudow", frames: 14, frame: 0, animT: 0, animRate: 0.012,
      rot: 0, spin: 0, // no RandomLaunchSpin, no spin track
      sc: [[0, 1]],
      al: [[0, 1], [0.9, 1], [1, 0]],
      grav: 0, dragAt: 2, drag: 0,
    });
  }
  // PARTICLE_FUMECLOUD (Plant::UpdateShooting 3245-3249: AddAttachedParticle
  // at mX+85, mY+31, RENDER_LAYER_PARTICLE): the user's own
  // compiled/particles/FumeCloud.xml (main.zip — decoded 0xDEADFED4+zlib
  // container, DefMap field order, same parser as the PeaSplat/PotatoMine
  // twins) is a SINGLE animated-strip emitter, exactly like their PeaSplat:
  // IMAGE_FUMESHROOM_BUBBLES (particles/fumeshroom_bubbles.png, 27 uniform
  // cels of 365x116), Box type, SystemDuration/ParticleDuration 50,
  // SpawnMinActive/MaxLaunched 1, EmitterOffset (190,-5), ParticleAlpha
  // hold-1-to-90%-then-fade, scale 1, AnimationRate 2.0. Retail's 40-mote
  // drifting FumeCloud.xml (IMAGE_PUFFSHROOM_PUFF1, X [20 300] drift) is
  // superseded by the user's baked strip — same relationship as PeaSplat vs
  // the retail splat model. The mote below mirrors the spudow mote shape so
  // tick/render stay identical; row is informational (cone is same-row only).
  spawnFumeCloud(x, y, row) {
    this.fumeClouds.push({
      x: x + 190, y: y - 5, row, age: 0, dur: 50,
      img: "fumeCloud", frames: 27, frame: 0, animT: 0, animRate: 0.02,
      rot: 0, spin: 0, // no RandomLaunchSpin, no spin track
      sc: [[0, 1]],
      al: [[0, 1], [0.9, 1], [1, 0]],
      grav: 0, dragAt: 2, drag: 0,
    });
  }
  // Whack hammer POW (PARTICLE_POW at RENDER_LAYER_ABOVE_UI,
  // Challenge::MouseDownWhackAZombie 1222): single 50-tick mote at
  // (theX-3, theY+9), IMAGE_POW (particles/Pow.png), alpha holds to 90%
  // then fades (SystemAlpha 1,90 0,100). Ticked in updateFx, drawn in the
  // TOP pass above the UI.
  spawnPow(x, y) {
    this.pows.push({ x, y, age: 0, dur: 50 });
  }
  // Plant::IceZombies (Plant.cpp:4249): EVERY zombie takes HitIceTrap (the
  // chill + freeze + 20 bypass damage + re-rate inside hitIceTrap), then
  // mIceTrapCounter = 300. The pool-sparkle resume (4258-4263) has no target
  // here (no poolSparkly system ships in this port) and BossDestroyFireball
  // (4264-4268) has no boss in the 1-9 scope — both noted, neither modeled.
  iceZombies() {
    for (const z of this.zombies) if (!z.gone) z.hitIceTrap();
    this.iceTrapCounter = 300;
  }
  // Detonation emitters (PARTICLE_ICE_TRAP at the plant center): the IceFlash
  // core (single 20x20 white-hot mote, swelling to ~8x and fading over its
  // 25-tick life) + the snowflake burst (26 drifting SNOWFLAKES motes, gentle
  // fall, fading over the last 30%). Track strings use the same
  // parsePowieTrack/evalPowieTrack engine as POWIE_DEFS above.
  spawnIceTrap(x, y) {
    for (const def of ICE_DET_DEFS) {
      this.iceFx.push({
        def, cx: x, cy: y, sysAge: 0,
        sysDur: Math.max(1, Math.round(evalPowieTrack(def.sysDurN, 0, 0.5))),
        accum: 0, spawned: 0, motes: [],
      });
    }
  }
  // Thaw/death pop (PARTICLE_ICE_TRAP_RELEASE at the victim's +75/+106): 10
  // ice-shard motes that pop on tick 1 and fall away over ~half a second.
  spawnIceRelease(x, y) {
    for (const def of ICE_RELEASE_DEFS) {
      this.iceFx.push({
        def, cx: x, cy: y, sysAge: 0,
        sysDur: Math.max(1, Math.round(evalPowieTrack(def.sysDurN, 0, 0.5))),
        accum: 0, spawned: 0, motes: [],
      });
    }
  }
  spawnIceMote(em, st) {
    const d = em.def, R = Math.random;
    const m = { di: R(), ri: R(), si: R(), sci: R(), spi: R(), ai: R() };
    // ParticleDuration constructor default is 100 (unset tracks read 0).
    m.dur = Math.max(1, Math.round(d.durN ? evalPowieTrack(d.durN, st, m.di) : 100));
    m.age = 0;
    // SpawnParticle emitter shapes (TodParticle.cpp:516160): Box evaluates
    // each axis (release shards), Circle puts the mote at angle-0-is-down
    // (sin, cos) x radius (detonation flakes); LaunchAngle is unset on both
    // retail emitters, so Circle angles are uniform [0, 2PI).
    if (d.type === "box") {
      m.x = em.cx + evalPowieTrack(d.boxXN, st, R());
      m.y = em.cy + evalPowieTrack(d.boxYN, st, R());
    } else if (d.type === "circle") {
      const r = d.radiusN ? evalPowieTrack(d.radiusN, st, m.ri) : 0; // EmitterRadius default 0
      const a = R() * Math.PI * 2;
      m.x = em.cx + Math.sin(a) * r;
      m.y = em.cy + Math.cos(a) * r;
    } else { m.x = em.cx; m.y = em.cy; }
    const a = R() * Math.PI * 2;
    const sp = (d.speedN ? evalPowieTrack(d.speedN, st, m.si) : 0) * 0.01; // LaunchSpeed default 0
    m.vx = Math.sin(a) * sp;
    m.vy = Math.cos(a) * sp;
    m.spin = R() * Math.PI * 2; // PARTICLE_RANDOM_LAUNCH_SPIN (both retail emitters set it)
    m.spinVel = (d.spinN ? evalPowieTrack(d.spinN, st, m.spi) : 0) * 0.01 * Math.PI / 180;
    if (d.img === "shards") m.shard = Math.floor(R() * ICE_SHARDS.length); // random whole-shard crop (bounds above)
    else if (d.img === "flakes") m.frame = Math.floor(R() * 3); // 3 static snow cels (ImageFrames 3)
    em.motes.push(m);
  }
  // TodParticleEmitter::Update for one ICE emitter. Same shape as tickPowie
  // (fields, then position += velocity, spin, age++; rate/minActive/
  // maxLaunched spawning; DeleteNonCrossFading sweep on system death) plus
  // the FIELD_ACCELERATION gravity line the ballistic bursts need.
  tickIceFx(em) {
    const d = em.def;
    em.sysAge++;
    const die = em.sysAge >= em.sysDur;
    const st = em.sysDur <= 1 ? 1 : Math.min(1, em.sysAge / (em.sysDur - 1)); // mSystemTimeValue
    for (const m of em.motes) {
      // UpdateParticle: fields, then position += velocity, spin, age++.
      const t = m.dur <= 1 ? 1 : m.age / (m.dur - 1); // mParticleTimeValue
      const fr = d.fricN ? evalPowieTrack(d.fricN, t, 0.5) : 0; // FIELD_FRICTION: vel *= 1-x
      if (fr) { m.vx *= 1 - fr; m.vy *= 1 - fr; }
      if (d.gravN) m.vy += evalPowieTrack(d.gravN, t, 0.5) * 0.01; // FIELD_ACCELERATION x0.01
      m.x += m.vx; m.y += m.vy;
      m.spin += m.spinVel;
      m.age++;
    }
    em.motes = em.motes.filter((m) => m.age < m.dur);
    if (die) return false;
    // UpdateSpawning (same as tickPowie): rate x0.01/tick; minActive forces
    // the flash + all 40 flakes (detonation) or all [5 10] shards (release)
    // out on tick 1; no maxLaunched caps on either retail emitter.
    const evCap = (nodes) => (nodes ? evalPowieTrack(nodes, st, Math.random()) : -1);
    em.accum += (d.rateN ? evalPowieTrack(d.rateN, st, Math.random()) : 0) * 0.01;
    let n = Math.floor(em.accum); em.accum -= n;
    const minA = evCap(d.minActiveN), maxA = evCap(d.maxActiveN), maxL = evCap(d.maxLaunchedN);
    if (minA >= 0 && n < minA - em.motes.length) n = minA - em.motes.length;
    if (maxA >= 0 && n > maxA - em.motes.length) n = Math.max(0, maxA - em.motes.length);
    if (maxL >= 0 && n > maxL - em.spawned) n = Math.max(0, maxL - em.spawned);
    for (let i = 0; i < n; i++) { this.spawnIceMote(em, st); em.spawned++; }
    return true;
  }
  // Ice-shroom fx (PARTICLE_ICE_TRAP at the detonation + PARTICLE_ICE_TRAP_
  // RELEASE on thaw/frozen-death, both RENDER_LAYER_TOP): exact retail
  // IceTrap.xml + IceTrapRelease.xml emitters from main.zip (see ICE_DET_DEFS
  // above), run through the retail TodParticle engine shape (fields -> pos ->
  // spin -> age, rate/minActive/maxLaunched spawning, DeleteNonCrossFading
  // on system death — same motor as tickPowie/tickDoomFx); every pixel is
  // byte-identical main.zip art: the detonation = FullScreen IceFlash
  // (IMAGE_WHITEPIXEL 20x20 drawn fullscreen) + an IMAGE_SNOWFLAKES burst
  // (60x20 sheet = 3 cels of 20x20); the thaw/death pop =
  // IMAGE_ICETRAP_PARTICLES shards (67x17 sheet = 4 shard cels whose exact
  // opaque bounds [x,w] = [2,12]/[18,15]/[36,13]/[51,14] were measured
  // live — the compiled strip has no uniform stride, so motes crop those
  // bounds instead of slicing thirds).
  // PARTICLE_POWIE spawn (Plant::DoSpecial cherry 4361 / explode-o-nut 2431:
  // AddTodParticle(aPosX, aPosY, RENDER_LAYER_TOP, PARTICLE_POWIE), where
  // aPosX/aPosY = plant center = mX+mWidth/2). Runs the 3 Powie.xml emitters
  // above through the TodParticle update below (tickPowie); the renderer
  // draws them in the TOP pass like RenderParticle (centered, rotated,
  // scaled, colorized, alpha-faded).
  spawnPowie(x, y) {
    for (const def of POWIE_DEFS) {
      this.powies.push({
        def, cx: x, cy: y, sysAge: 0,
        sysDur: Math.max(1, Math.round(evalPowieTrack(def.sysDurN, 0, 0.5))),
        accum: 0, spawned: 0, motes: [],
      });
    }
  }
  spawnPowieMote(em, st) {
    const d = em.def, R = Math.random;
    const m = { di: R(), ri: R(), si: R(), sci: R(), spi: R(), ai: R() };
    // ParticleDuration constructor default is 100 (word: unset track).
    m.dur = Math.max(1, Math.round(d.durN ? evalPowieTrack(d.durN, st, m.di) : 100));
    m.age = 0;
    const r = evalPowieTrack(d.radiusN, st, m.ri); // EmitterRadius default 0
    const a = R() * Math.PI * 2; // LaunchAngle unset -> uniform [0, 2PI)
    const sp = evalPowieTrack(d.speedN, st, m.si) * 0.01; // LaunchSpeed default 0
    m.x = em.cx + Math.sin(a) * r; // Circle: angle 0 = straight down (+y)
    m.y = em.cy + Math.cos(a) * r;
    m.vx = Math.sin(a) * sp;
    m.vy = Math.cos(a) * sp;
    m.spin = d.randSpin ? R() * Math.PI * 2 : 0; // PARTICLE_RANDOM_LAUNCH_SPIN
    m.spinVel = evalPowieTrack(d.spinN, st, m.spi) * 0.01 * Math.PI / 180; // SpinSpeed x0.01 deg/tick -> rad
    em.motes.push(m);
  }
  // TodParticleEmitter::Update (517550) for one POWIE emitter. Returns false
  // when spent (the whole entry is swept, motes included — DeleteNonCrossFading
  // on system death, which is what cuts the word off at its SystemDuration 50
  // even though the mote's own duration defaults to 100).
  tickPowie(em) {
    const d = em.def;
    em.sysAge++;
    const die = em.sysAge >= em.sysDur;
    const st = em.sysDur <= 1 ? 1 : Math.min(1, em.sysAge / (em.sysDur - 1)); // mSystemTimeValue
    for (const m of em.motes) {
      // UpdateParticle (516F00): fields, then position += velocity, spin, age++.
      const t = m.dur <= 1 ? 1 : m.age / (m.dur - 1); // mParticleTimeValue
      const fr = d.fricN ? evalPowieTrack(d.fricN, t, 0.5) : 0; // FIELD_FRICTION: vel *= 1-x
      if (fr) { m.vx *= 1 - fr; m.vy *= 1 - fr; }
      m.x += m.vx; m.y += m.vy;
      m.spin += m.spinVel;
      m.age++;
    }
    em.motes = em.motes.filter((m) => m.age < m.dur);
    if (die) return false;
    // UpdateSpawning (517160): rate accumulates x0.01/tick; minActive forces
    // the word out on tick 1; maxLaunched caps the 14+14 puffs lifetime-total.
    // (Unset rate defaults 0, unset min/max caps default -1 = ignore.)
    const evCap = (nodes) => (nodes ? evalPowieTrack(nodes, st, Math.random()) : -1);
    em.accum += (d.rateN ? evalPowieTrack(d.rateN, st, Math.random()) : 0) * 0.01;
    let n = Math.floor(em.accum); em.accum -= n;
    const minA = evCap(d.minActiveN), maxA = evCap(d.maxActiveN), maxL = evCap(d.maxLaunchedN);
    if (minA >= 0 && n < minA - em.motes.length) n = minA - em.motes.length;
    if (maxA >= 0 && n > maxA - em.motes.length) n = Math.max(0, maxA - em.motes.length);
    if (maxL >= 0 && n > maxL - em.spawned) n = Math.max(0, maxL - em.spawned);
    for (let i = 0; i < n; i++) { this.spawnPowieMote(em, st); em.spawned++; }
    return true;
  }
  // Doom blast (PARTICLE_DOOM at the plant center, RENDER_LAYER_TOP,
  // AddTodParticle 4374): the 11 Doom.xml emitters through the TodParticle
  // update below (tickDoomFx); the renderer draws them in the TOP pass like
  // RenderParticle (centered, rotated, tinted, stretched, alpha-faded).
  // SystemPosition is constant on every emitter (a single first-tick jump —
  // TodParticleEmitter::UpdateSystemField with FromLastTime(-1) = 0, the
  // same -1-reads-0 as the arm's Position field in tickGraveArm), so it
  // bakes into the emitter center once here instead of accumulating.
  spawnDoom(x, y) {
    for (const def of DOOM_DEFS) {
      const ox = def.sysXN ? evalPowieTrack(def.sysXN, 0, 0.5) : 0;
      const oy = def.sysYN ? evalPowieTrack(def.sysYN, 0, 0.5) : 0;
      this.doomFx.push({
        def, cx: x + ox, cy: y + oy, sysAge: 0,
        sysDur: Math.max(1, Math.round(evalPowieTrack(def.sysDurN, 0, 0.5))),
        accum: 0, spawned: 0, motes: [],
      });
    }
  }
  spawnDoomMote(em, st) {
    const d = em.def, R = Math.random;
    const m = {
      di: R(), ri: R(), si: R(), sci: R(), spi: R(), ai: R(), bi: R(),
      fxxi: R(), fyxi: R(), fxyi: R(), fyyi: R(), sxi: R(), syi: R(),
    };
    // ParticleDuration constructor default is 100 (unset tracks read 0
    // through FloatTrack defaults — every doom emitter sets its own).
    m.dur = Math.max(1, Math.round(evalPowieTrack(d.durN, st, m.di)));
    m.age = 0;
    // SpawnParticle emitter shapes (TodParticle.cpp:516160): Circle puts
    // the mote at angle-0-is-down (sin, cos) x radius; Box evaluates each
    // axis; point emitters ride the EmitterOffset. LaunchAngle is unset on
    // every doom emitter, so Circle angles are uniform [0, 2PI).
    if (d.type === "box") {
      m.x = em.cx + evalPowieTrack(d.boxXN, st, R());
      m.y = em.cy + evalPowieTrack(d.boxYN, st, R());
    } else if (d.type === "circle") {
      const r = evalPowieTrack(d.radiusN, st, m.ri);
      const a = R() * Math.PI * 2;
      m.x = em.cx + Math.sin(a) * r;
      m.y = em.cy + Math.cos(a) * r;
    } else {
      m.x = em.cx + (d.offXN ? evalPowieTrack(d.offXN, st, 0.5) : 0);
      m.y = em.cy + (d.offYN ? evalPowieTrack(d.offYN, st, 0.5) : 0);
    }
    // LaunchSpeed is 0 on every doom emitter (no ballistic motion).
    m.vx = 0; m.vy = 0;
    // PARTICLE_RANDOM_LAUNCH_SPIN (SpawnParticle 516160): random [0, 2PI)
    // start angle; the spin velocity itself is re-evaluated per tick below.
    m.spin = d.randSpin ? R() * Math.PI * 2 : 0;
    m.spinVel = d.spinN ? evalPowieTrack(d.spinN, st, m.spi) * 0.01 * Math.PI / 180 : 0;
    m.animT = 0; // mAnimationTimeValue (animated Base strip only)
    m.jx = 0; m.jy = 0; // current Shake render offsets (retail removes last
    em.motes.push(m);   // tick's jitter before adding this tick's — same as
  }                     // the arm mote's yOff/jx/jy split in tickGraveArm.
  // TodParticleEmitter::Update (517000-ish) for one DOOM emitter. Returns
  // false when spent (the whole entry is swept, motes included —
  // DeleteNonCrossFading on system death at sysDur 400, which is what cuts
  // every mote's life even though the mushroom motes' own dur is 150).
  tickDoomFx(em) {
    const d = em.def;
    em.sysAge++;
    const die = em.sysAge >= em.sysDur;
    const st = em.sysDur <= 1 ? 1 : Math.min(1, em.sysAge / (em.sysDur - 1)); // mSystemTimeValue
    for (const m of em.motes) {
      // UpdateParticle (516F00): fields, then position += velocity, spin, age++.
      const t = m.dur <= 1 ? 1 : m.age / (m.dur - 1); // mParticleTimeValue
      const lastT = m.dur <= 1 ? 1 : Math.max(0, (m.age - 1) / (m.dur - 1));
      // FIELD_POSITION (FromLastTime(-1) = 0 on the first tick — same as
      // tickGraveArm): pos += cur - last.
      if (d.posXN) m.x += evalPowieTrack(d.posXN, t, m.fxxi) - (m.age === 0 ? 0 : evalPowieTrack(d.posXN, lastT, m.fxxi));
      if (d.posYN) m.y += evalPowieTrack(d.posYN, t, m.fxyi) - (m.age === 0 ? 0 : evalPowieTrack(d.posYN, lastT, m.fxyi));
      // FIELD_SHAKE (TodParticle.cpp:25882): per-tick seeded jitter at the
      // track amplitude (shakeJitter mirrors the srand(age*particle) shape).
      const axT = d.shakeXN ? evalPowieTrack(d.shakeXN, t, m.sxi) : 0;
      const ayT = d.shakeYN ? evalPowieTrack(d.shakeYN, t, m.syi) : 0;
      m.jx = this.shakeJitter(m.age, 7) * axT;
      m.jy = this.shakeJitter(m.age, 13) * ayT;
      m.x += m.vx; m.y += m.vy;
      m.spin += m.spinVel;
      // AnimationRate (UpdateParticle 516F00): animT += rate*0.01, wraps —
      // the Base strip's 3 frames play floor(animT*3) like RenderParticle.
      if (d.animRateN) { m.animT += evalPowieTrack(d.animRateN, t, 0.5) * 0.01; if (m.animT >= 1) m.animT -= 1; }
      m.age++;
    }
    em.motes = em.motes.filter((m) => m.age < m.dur);
    if (die) return false;
    // UpdateSpawning (517160): rate accumulates x0.01/tick; minActive forces
    // everything out on tick 1; maxLaunched caps the lifetime total.
    // (Unset rate defaults 0, unset min/max caps default -1 = ignore.)
    const evCap = (nodes) => (nodes ? evalPowieTrack(nodes, st, Math.random()) : -1);
    em.accum += (d.rateN ? evalPowieTrack(d.rateN, st, Math.random()) : 0) * 0.01;
    let n = Math.floor(em.accum); em.accum -= n;
    const minA = evCap(d.minActiveN), maxA = evCap(d.maxActiveN), maxL = evCap(d.maxLaunchedN);
    if (minA >= 0 && n < minA - em.motes.length) n = minA - em.motes.length;
    if (maxA >= 0 && n > maxA - em.motes.length) n = Math.max(0, maxA - em.motes.length);
    if (maxL >= 0 && n > maxL - em.spawned) n = Math.max(0, maxL - em.spawned);
    for (let i = 0; i < n; i++) { this.spawnDoomMote(em, st); em.spawned++; }
    return true;
  }
  // Zamboni systems (PARTICLE_ZAMBONI_SMOKE/TIRE/EXPLOSION/EXPLOSION2) + the
  // UpdateIce PARTICLE_ICE_SPARKLE: TodParticleEmitter::Update shape. Fields
  // in enum order (TodParticle.h ParticleFieldType): FRICTION (ft 1, x0.01-
  // implied like the doom fric), ACCELERATION (ft 2, vel += 0.01*x/y),
  // POSITION (ft 6, pos += cur - last with last = 0 on the first tick),
  // AWAY (ft 11, pos += normalize(pos-center)*0.01*(x + radius*y)). Then
  // position += velocity, spin (+= spinVel + spinAngle delta, first-tick
  // last = 0), age++. Spawning via rate x0.01 + min/maxActive + maxLaunched;
  // DeleteNonCrossFading sweep on system death (SYSTEM_LOOPS restarts the
  // system instead — the stage-2 stack smoke and the ice sparkles loop until
  // their owner dies). Launch angles are degrees, angle 0 = straight down
  // (sin/cos); speeds, gravity and AWAY magnitudes are x0.01 px/tick.
  // Frames are static randoms (no AnimationRate on any zam emitter):
  // smoke 3, dirt 8, zomboss 5, everything else 1.
  spawnZamFx(defs, x, y, opts) {
    for (const def of defs) {
      if (!def.img) continue; // the Smoke system's empty second emitter
      // Unset SystemDuration defaults to the ParticleDuration hi end at
      // interp 1 (emitter ctor) — the tire wisp's 60, the sparkle's 200.
      const sysDur = def.sysDurN
        ? Math.max(1, Math.round(evalPowieTrack(def.sysDurN, 0, Math.random())))
        : Math.max(1, Math.round(evalPowieTrack(def.durN, 0, 1)));
      this.zamFx.push({
        def, cx: x, cy: y, sysAge: 0, sysDur, accum: 0, spawned: 0, motes: [],
        ...(opts || {}),
      });
    }
  }
  spawnZamMote(em, st) {
    const d = em.def, R = Math.random;
    const m = { di: R(), ri: R(), si: R(), ai: R(), sci: R(), spi: R(), fxi: R(), fyi: R(), awxi: R(), awyi: R() };
    m.dur = Math.max(1, Math.round(d.durN ? evalPowieTrack(d.durN, st, m.di) : 100));
    m.age = 0;
    const hasAngle = !!d.angleN;
    const a = hasAngle ? evalPowieTrack(d.angleN, st, R()) * Math.PI / 180 : R() * Math.PI * 2;
    if (d.boxXN || d.boxYN) {
      m.x = em.cx + (d.boxXN ? evalPowieTrack(d.boxXN, st, R()) : 0);
      m.y = em.cy + (d.boxYN ? evalPowieTrack(d.boxYN, st, R()) : 0);
    } else {
      const r = d.radiusN ? evalPowieTrack(d.radiusN, st, m.ri) : 0;
      m.x = em.cx + Math.sin(a) * r;
      m.y = em.cy + Math.cos(a) * r;
    }
    m.x += d.offXN ? evalPowieTrack(d.offXN, st, R()) : 0;
    m.y += d.offYN ? evalPowieTrack(d.offYN, st, R()) : 0;
    const sp = (d.speedN ? evalPowieTrack(d.speedN, st, m.si) : 0) * 0.01; // LaunchSpeed x0.01
    m.vx = Math.sin(a) * sp;
    m.vy = Math.cos(a) * sp;
    m.spin = (d.flags & 1) ? R() * Math.PI * 2 : 0; // PARTICLE_RANDOM_LAUNCH_SPIN
    const frames = ZAM_IMG_FRAMES[d.img] || 1;
    m.frame = frames > 1 ? Math.floor(R() * frames) : 0; // static random cel
    em.motes.push(m);
  }
  tickZamFx(em) {
    const d = em.def;
    em.sysAge++;
    // Attached systems (stage-2 stack smoke, dying wheelie smoke) ride the
    // machine: AddAttachedParticle pins them to the reanim, so the center
    // follows the zombie. The system dies with the machine.
    if (em.follow) {
      if (em.follow.dead || em.follow.gone || em.follow.mowed) return false;
      em.cx = em.follow.x + (em.fox || 0);
      em.cy = em.follow.y + (em.foy || 0);
    }
    let die = em.sysAge >= em.sysDur;
    if (die && (d.flags & 8) && !em.noSpawn) { em.sysAge = 0; die = false; } // PARTICLE_SYSTEM_LOOPS (crossfaded detaches never restart)
    for (const m of em.motes) {
      // UpdateParticle (516F00): fields, then position += velocity, spin, age++.
      const t = m.dur <= 1 ? 1 : m.age / (m.dur - 1); // mParticleTimeValue
      const lastT = m.dur <= 1 ? 1 : Math.max(0, (m.age - 1) / (m.dur - 1));
      if (d.fricXN) m.vx *= 1 - evalPowieTrack(d.fricXN, t, 0.5);
      if (d.fricYN) m.vy *= 1 - evalPowieTrack(d.fricYN, t, 0.5);
      if (d.gravXN) m.vx += evalPowieTrack(d.gravXN, t, 0.5) * 0.01;
      if (d.gravYN) m.vy += evalPowieTrack(d.gravYN, t, 0.5) * 0.01;
      if (d.posXN) m.x += evalPowieTrack(d.posXN, t, m.fxi) - (m.age === 0 ? 0 : evalPowieTrack(d.posXN, lastT, m.fxi));
      if (d.posYN) m.y += evalPowieTrack(d.posYN, t, m.fyi) - (m.age === 0 ? 0 : evalPowieTrack(d.posYN, lastT, m.fyi));
      if (d.awayXN || d.awayYN) {
        const dx = m.x - em.cx, dy = m.y - em.cy, r = Math.hypot(dx, dy);
        if (r > 0.0001) {
          const ax = d.awayXN ? evalPowieTrack(d.awayXN, t, m.awxi) : 0;
          const ay = d.awayYN ? evalPowieTrack(d.awayYN, t, m.awyi) : 0;
          const k = 0.01 * (ax + r * ay) / r;
          m.x += dx * k; m.y += dy * k;
        }
      }
      m.x += m.vx; m.y += m.vy;
      const sv = d.spinN ? evalPowieTrack(d.spinN, t, m.spi) * 0.01 * Math.PI / 180 : 0;
      let sa = 0;
      if (d.spinAN) sa = (evalPowieTrack(d.spinAN, t, m.spi) - (m.age === 0 ? 0 : evalPowieTrack(d.spinAN, lastT, m.spi))) * Math.PI / 180;
      m.spin += sv + sa;
      m.age++;
    }
    em.motes = em.motes.filter((m) => m.age < m.dur);
    if (die && !em.noSpawn) return false;
    // Crossfaded detach (WalkIntoHouse smoke detach): the emitter is spent —
    // no new motes, but the airborne ones finish (DeleteNonCrossFading sweep).
    if (em.noSpawn) return em.motes.length > 0;
    // UpdateSpawning (517160): rate x0.01/tick; minActive forces the one-shot
    // bursts out on tick 1; maxLaunched caps the lifetime total.
    const evCap = (nodes) => (nodes ? evalPowieTrack(nodes, em.sysDur <= 1 ? 1 : Math.min(1, em.sysAge / (em.sysDur - 1)), Math.random()) : -1);
    em.accum += (d.rateN ? evalPowieTrack(d.rateN, em.sysDur <= 1 ? 1 : Math.min(1, em.sysAge / (em.sysDur - 1)), Math.random()) : 0) * 0.01;
    let n = Math.floor(em.accum); em.accum -= n;
    const minA = evCap(d.minActiveN), maxA = evCap(d.maxActiveN), maxL = evCap(d.maxLaunchedN);
    if (minA >= 0 && n < minA - em.motes.length) n = minA - em.motes.length;
    if (maxA >= 0 && n > maxA - em.motes.length) n = Math.max(0, maxA - em.motes.length);
    if (maxL >= 0 && n > maxL - em.spawned) n = Math.max(0, maxL - em.spawned);
    for (let i = 0; i < n; i++) { this.spawnZamMote(em, em.sysDur <= 1 ? 1 : Math.min(1, em.sysAge / (em.sysDur - 1))); em.spawned++; }
    return true;
  }
  // ZamboniDeath non-wheelie branch + TakeBodyDamage stage 2 (Zombie.cpp
  // 6413/7816): the stack smoke. AddAttachedParticle(27,72 to the
  // zombie_zamboni_1 track — the system rides the machine (follow), looping
  // until the machine is gone.
  spawnZamSmoke(x, y, follow) {
    if (follow) this.spawnZamFx(ZAM_SMOKE_DEFS, x, y, { follow, fox: x - follow.x, foy: y - follow.y });
    else this.spawnZamFx(ZAM_SMOKE_DEFS, x, y);
  }
  // ZamboniDeath spike branch (6413-6420): the tire burst at (+29,+114),
  // world-space (AddTodParticle) — 500 ticks of dirt clods + looping wisps.
  spawnZamTire(x, y) { this.spawnZamFx(ZAM_TIRE_DEFS, x, y); }
  // ZamboniDeath/UpdateDeath explosion (6424/290780): the 6-emitter burst at
  // (+80,+60) — EXPLOSION2 when the wheelie2 layer shows, else EXPLOSION.
  spawnZamExplosion(x, y, big) { this.spawnZamFx(big ? ZAM_EXPLOSION2_DEFS : ZAM_EXPLOSION_DEFS, x, y); }
  // MowDown ineligible branch (Zombie.cpp:8565): PARTICLE_MOWER_CLOUD at
  // (mPosX+110, mPosY) — the MOWER_DEFS burst above, world-space.
  spawnMowerCloud(x, y) { this.spawnZamFx(MOWER_DEFS, x, y); }
  // Jack-in-the-box detonation (UpdateZombieJackInTheBox 2016): the 4-emitter
  // PARTICLE_JACKEXPLODE burst at the blast center, RENDER_LAYER_TOP — rides
  // the same zamFx TOP-layer engine/render path as the zamboni explosions.
  spawnJackExplode(x, y) { this.spawnZamFx(JACK_DEFS, x, y); }
  // Board::KillAllPlantsInRadius (Board.cpp): circle-vs-plant-rect kill.
  // Zombie::SquishAllInSquare (Zombie.cpp:6391): every live plant in the
  // square squashes (spiky + spikerock skip), mPlantsEaten++ each.
  squishAllInSquare(col, row) {
    for (const c of this.cells) {
      if (c.col !== col || c.row !== row) continue;
      // IteratePlants covers every slot incl. the flying coffee (a squashed
      // host flattens its bean too — Plant::Draw has the IsFlying+mSquished
      // offset branch for it).
      for (const k of ["lily", "pot", "base", "shell", "flying"]) {
        const p = c[k];
        if (!p || p.dead) continue;
        if (p.seed === 21) continue; // IsSpiky (Plant.cpp:649): spikeweed is never squashed (spikerock has no seed in this port)
        this.eatenCount = (this.eatenCount | 0) + 1; // mPlantsEaten (6391)
        p.squish();
      }
    }
  }
  // Board::IsIceAt (Board.cpp:2740): the sheet covers grid x when the timer
  // runs and the leading edge reaches in past 750.
  isIceAt(c, r) {
    if (!this.iceTimer[r] || this.iceMinX[r] > 750) return false;
    const keep = Math.max(0, pixelToGrid(this.iceMinX[r] + 12, 0, this.bg).col); // PixelToGridXKeepOnBoard
    return c >= keep;
  }
  // Grave dirt systems (GraveStoneRise roll bursts, GRAVE_BUSTER while the
  // buster chews, GRAVE_BUSTER_DIE on clear, ZombieRise DirtSplash): one Box
  // system each, same TodParticleEmitter::Update shape as the powie systems
  // (fields -> pos -> spin -> age; rate x0.01 accumulates; min/maxActive +
  // maxLaunched caps; DeleteNonCrossFading on system death). LaunchSpeed is
  // x0.01 px/tick (angle 0 = down); friction is raw (vel *= 1-x); gravity is
  // 0.01-scaled (vy += 0.05/tick at Y 5.0); spin speed is x0.01 deg/tick;
  // frame is a static random of the 8 row cels (no AnimationRate/Animated).
  spawnGraveDirt(kind, x, y, row = -1) {
    const d = GRAVE_DIRT_DEFS[kind];
    this.graveFx.push({
      kind: "dirt", def: d, cx: x, cy: y, baseY: y, row, sysAge: 0,
      sysDur: Math.max(1, Math.round(evalPowieTrack(d.sysDurN, 0, 0.5))),
      accum: 0, spawned: 0, motes: [],
    });
  }
  spawnGraveRise(x, y, row = -1) { this.spawnGraveDirt("rise", x, y, row); } // GridItem::AddGraveStoneParticles (GridItem.cpp:423)
  spawnGraveBuster(x, y, row = -1) { this.spawnGraveDirt("buster", x, y, row); } // UpdateGraveBuster LANDING->EATING (Plant.cpp:1105, attached)
  spawnGraveBusterDie(x, y, row = -1) { this.spawnGraveDirt("die", x, y, row); } // UpdateGraveBuster EATING end (Plant.cpp:1117)
  // Digger particles (Zombie.cpp ctor/AddAttachedParticle + UpdateZombieDigger):
  // TUNNEL = Tossed Rocks (rate 20, follow the zombie) + Ground Rocks (rate
  // track "2 4 6 2 0 8 2 6 4", ParticlesDontFollow — stay in world space),
  // RISE = 20-mote upfront burst (Rocks SpawnMinActive 20), DIRT = rise dirt reanim.
  // Row-banded (mRenderOrder+1).
  spawnDiggerTunnel(z) {
    this.diggerFx.push({ kind: "tunnel", z, row: z.row, sysAge: 0, sysDur: 1e9, accum: 0, spawned: 0, motes: [], lx: z.x, ly: z.y });
  }
  detachDiggerTunnel(z) {
    this.diggerFx = this.diggerFx.filter((em) => em.z !== z);
  }
  spawnDiggerRise(x, y, row = -1) {
    // DiggerRise.xml Rocks: SpawnMinActive 20 upfront in Box [-35 35]x-14,
    // dur [30,40], sysDur 500, IMAGE_DIRTSMALL row 0 (8 frames), angle
    // [140,220], speed [50,400], fric 0.015, grav 5, spin [-720,720],
    // sysAlpha 1,92 0, pAlpha 1,70 0. Launch velocity is (sin,cos) like
    // every other emitter (angle 0 = straight down).
    const motes = [];
    for (let i = 0; i < 20; i++) {
      const dur = 30 + Math.random() * 10;
      const ang = (140 + Math.random() * 80) * Math.PI / 180;
      const sp = (50 + Math.random() * 350) * 0.01;
      motes.push({ x: x + (-35 + Math.random() * 70), y: y - 14, vx: Math.sin(ang) * sp, vy: Math.cos(ang) * sp, age: 0, dur, interp: Math.random(), frame: Math.floor(Math.random() * 8), spin: Math.random() * Math.PI * 2, spinVel: (Math.random() * 1440 - 720) * Math.PI / 180 * 0.01, sc: 0.7 + Math.random() * 0.2 });
    }
    this.diggerFx.push({ kind: "rise", z: null, row, sysAge: 0, sysDur: 500, accum: 0, spawned: 20, motes });
  }
  spawnDiggerDirt(x, y, row = -1) {
    // REANIM_DIGGER_DIRT at (+13,+97,renderOrder+1) @24 PLAY_ONCE (full
    // 26-frame timeline, ~108 ticks). Retail is AddReanimation + mAnimRate
    // only (Zombie.cpp:2696/2739) — no PlayReanim call — so the dirt plays
    // the full default timeline once (Reanimation ctor default PLAY_ONCE,
    // Reanimator.cpp:293) and the effect holder sweeps the dead reanim.
    try {
      const r = this.makeReanim("Digger_rising_dirt", x, y);
      r.loopType = PLAY_ONCE;
      r.animRate = 24;
      this.diggerDirt.push({ body: r, row });
    } catch (e) { /* def missing */ }
  }
  tickDiggerFx() {
    for (const em of this.diggerFx) {
      em.sysAge++;
      if (em.kind === "tunnel" && em.z && !em.z.gone) {
        // Tossed Rocks ride the zombie (attached); Ground Rocks have
        // ParticlesDontFollow=1 and stay in world space — the delta shift
        // skips them so the grass clods sit at the dig site.
        const dx = em.z.x - em.lx, dy = em.z.y - em.ly;
        em.lx = em.z.x; em.ly = em.z.y;
        if (dx || dy) for (const m of em.motes) { if (!m.ground) { m.x += dx; m.y += dy; } }
        // Tossed Rocks: rate 20/s -> 0.2/tick. Ground Rocks: per-second
        // rate track "2 4 6 2 0 8 2 6 4" over a ~90-tick cycle (x0.01) —
        // separate accumulators, no fixed ground/tossed ratio.
        em.accum += 0.2;
        em.gaccum = (em.gaccum || 0) + (DIGGER_GROUND_RATE[Math.floor(em.sysAge / 10) % 9] || 0) * 0.01;
        let n = Math.floor(em.accum); em.accum -= n;
        while (n-- > 0) {
          const dur = 40 + Math.random() * 10;
          const ang = (140 + Math.random() * 35) * Math.PI / 180;
          const sp = (150 + Math.random() * 150) * 0.01;
          em.motes.push({ x: em.z.x + 60 + (-35 + Math.random() * 45), y: em.z.y + 100, vx: Math.sin(ang) * sp, vy: Math.cos(ang) * sp, age: 0, dur, frame: Math.floor(Math.random() * 8), spin: Math.random() * Math.PI * 2, spinVel: (Math.random() * 1440 - 720) * Math.PI / 180 * 0.01, sc: 0.5 + Math.random() * 0.3, shi: Math.random(), jx: 0, jy: 0, ground: false, big: false });
        }
        let g = Math.floor(em.gaccum); em.gaccum -= g;
        while (g-- > 0) {
          const dur = 60 + Math.random() * 20;
          em.motes.push({ x: em.z.x + 60 + (-40 + Math.random() * 30), y: em.z.y + 100 + (14 + Math.random() * 6), vx: 0, vy: 0, age: 0, dur, frame: Math.floor(Math.random() * 4), spin: Math.random() * Math.PI * 2, spinVel: (-100 - Math.random() * 600) * Math.PI / 180 * 0.01, sc: 0, sci: Math.random(), shi: Math.random(), jx: 0, jy: 0, ground: true, big: true });
        }
      }
      for (const m of em.motes) {
        const t = m.dur <= 1 ? 1 : Math.min(1, m.age / (m.dur - 1));
        if (em.kind === "rise") {
          // DiggerRise Rocks: friction 0.015, gravity 5 x0.01.
          m.vx *= 0.985; m.vy *= 0.985; m.vy += 0.05; m.x += m.vx; m.y += m.vy;
        } else if (m.ground) {
          // Ground Rocks: no launch velocity — the Velocity field drifts x
          // by 0.01 * [-1 -> 0] per tick, plus Shake 2->0 jitter; scale
          // grows 0 -> [.3 .5] over the first 10% of life.
          m.x += 0.01 * evalPowieTrack(DIGGER_GROUND_VELXN, t, 0.5);
          m.sc = evalPowieTrack(DIGGER_GROUND_SCALEN, t, m.sci ?? 0.5);
          m.jx = this.shakeJitter(m.age, 29) * evalPowieTrack(DIGGER_GROUND_SHAKEN, t, m.shi ?? 0.5);
          m.jy = this.shakeJitter(m.age, 37) * evalPowieTrack(DIGGER_GROUND_SHAKEN, t, m.shi ?? 0.5);
        } else {
          // Tossed Rocks: friction 0.02, gravity 10 x0.01, Shake 1->0.
          m.vx *= 0.98; m.vy *= 0.98; m.vy += 0.1; m.x += m.vx; m.y += m.vy;
          m.jx = this.shakeJitter(m.age, 29) * evalPowieTrack(DIGGER_TOSSED_SHAKEN, t, m.shi ?? 0.5);
          m.jy = this.shakeJitter(m.age, 37) * evalPowieTrack(DIGGER_TOSSED_SHAKEN, t, m.shi ?? 0.5);
        }
        m.spin += m.spinVel; m.age++;
      }
      em.motes = em.motes.filter((m) => m.age < m.dur);
    }
    // Tunnel systems die with the zombie (detach on death); rise bursts sweep at sysDur.
    this.diggerFx = this.diggerFx.filter((em) => {
      if (em.z && (em.z.gone || em.z.dead)) return false;
      if (em.kind === "rise" && em.sysAge >= em.sysDur && !em.motes.length) return false;
      if (em.kind === "tunnel" && (!em.z || em.z.phase !== "tunnel")) return false;
      return true;
    });
    for (const d of this.diggerDirt) d.body.update();
    this.diggerDirt = this.diggerDirt.filter((d) => !d.body.dead);
  }
  // PARTICLE_MIND_CONTROL (Zombie::AnimateChewSound 4739, TodParticle data in
  // scratch/MindControl.xml): 20 motes of IMAGE_MINDCONTROL (13x50) on a
  // CircleEvenSpacing ring (radius 30), LaunchSpeed [100 110] (x0.01 px/tick),
  // 40-tick life, ParticleScale [.3 .6] -> [.4 .8] at 50% -> [.3 .6], alpha
  // 0 -> .7 at 10% -> hold -> 0 at 85-100%, AlignLaunchSpin + SpinAngle 180
  // (mote rotated to its launch angle + 180), Friction 0.0,40 .1. Rendered
  // in the TOP pass (RENDER_LAYER_PARTICLE + 1) like the other splat motes —
  // the existing splat tick/render path (friction, no gravity, animT-less
  // single-frame art) matches the emitter one-to-one, so motes ride it.
  spawnMindControl(x, y) {
    const D2R = Math.PI / 180;
    for (let i = 0; i < 20; i++) { // SpawnMinActive 20
      const a = (i / 20) * Math.PI * 2; // CircleEvenSpacing ring
      const sp = 1.0 + Math.random() * 0.1; // LaunchSpeed [100 110] x0.01
      this.splats.push({
        z: null, ox: x + Math.sin(a) * 30, oy: y + Math.cos(a) * 30,
        dx: 0, dy: 0, vx: Math.sin(a) * sp, vy: Math.cos(a) * sp,
        age: 0, dur: 40, img: "mindcontrol", frames: 1, frame: 0,
        rot: a + Math.PI, spin: 0, // AlignLaunchSpin + ParticleSpinAngle 180
        sc: [[0, 0.3 + Math.random() * 0.3], [0.5, 0.4 + Math.random() * 0.4], [1, 0.3 + Math.random() * 0.3]],
        al: [[0, 0], [0.1, 0.7], [0.85, 0.7], [1, 0]],
        grav: 0, dragAt: 0.4, drag: 0.1, // FIELD_FRICTION 0.0,40 .1
      });
    }
  }
  spawnGraveDirtMote(em, st) {
    const d = em.def, R = Math.random;
    const m = { di: R(), ai: R(), sci: R(), spi: R() };
    m.dur = Math.max(1, Math.round(evalPowieTrack(d.durN, st, m.di)));
    m.age = 0;
    // Box emitter: each axis evaluates its own track with its own interp.
    m.x = em.cx + evalPowieTrack(d.boxXN, st, R());
    // The buster system drifts down as it chews (SystemPosition Y "0 30",
    // TodParticleEmitter::UpdateSystemField): spawn at the drifted center.
    m.y = (em.kind === "dirt" && d.sysPosYN ? em.baseY + evalPowieTrack(d.sysPosYN, Math.min(1, em.sysAge / Math.max(1, em.sysDur - 1)), 0.5) : em.cy) + evalPowieTrack(d.boxYN, st, R());
    const sp = evalPowieTrack(d.speedN, st, m.di) * 0.01;
    const hasAngle = d.angle !== undefined;
    const a = hasAngle ? evalPowieTrack(d.angleN, st, R()) * Math.PI / 180 : R() * Math.PI * 2;
    m.vx = Math.sin(a) * sp;
    m.vy = Math.cos(a) * sp;
    m.spin = R() * Math.PI * 2; // PARTICLE_RANDOM_LAUNCH_SPIN on all four
    m.spinVel = evalPowieTrack(d.spinN, st, m.spi) * 0.01 * Math.PI / 180;
    m.frame = Math.floor(R() * 8); // static random of the 8 row cels
    m.sc = evalPowieTrack(d.pScaleN, st, m.sci);
    m.fric = d.fricN ? evalPowieTrack(d.fricN, 0.5, 0.5) : 0;
    m.grav = d.gravN ? evalPowieTrack(d.gravN, 0.5, 0.5) * 0.01 : 0;
    em.motes.push(m);
  }
  tickGraveDirt(em) {
    const d = em.def;
    em.sysAge++;
    const die = em.sysAge >= em.sysDur;
    const st = em.sysDur <= 1 ? 1 : Math.min(1, em.sysAge / (em.sysDur - 1));
    for (const m of em.motes) {
      // UpdateParticleField order (TodParticle.cpp:465): friction, then
      // acceleration, then position += velocity; spin; age++.
      if (m.fric) { m.vx *= 1 - m.fric; m.vy *= 1 - m.fric; }
      m.vy += m.grav;
      m.x += m.vx; m.y += m.vy;
      m.spin += m.spinVel;
      m.age++;
    }
    em.motes = em.motes.filter((m) => m.age < m.dur);
    if (die) return false;
    const evCap = (nodes) => (nodes ? evalPowieTrack(nodes, st, Math.random()) : -1);
    em.accum += (d.rateN ? evalPowieTrack(d.rateN, st, Math.random()) : 0) * 0.01;
    let n = Math.floor(em.accum); em.accum -= n;
    const minA = evCap(d.minActiveN), maxA = evCap(d.maxActiveN), maxL = evCap(d.maxLaunchedN);
    if (minA >= 0 && n < minA - em.motes.length) n = minA - em.motes.length;
    if (maxA >= 0 && n > maxA - em.motes.length) n = Math.max(0, maxA - em.motes.length);
    if (maxL >= 0 && n > maxL - em.spawned) n = Math.max(0, maxL - em.spawned);
    for (let i = 0; i < n; i++) { this.spawnGraveDirtMote(em, st); em.spawned++; }
    return true;
  }
  // ZombieRise (Zombie.cpp:8200-8219, land branch): the arm + DirtSplash +
  // DirtClumps systems at the zombie center (mPosX+60, mPosY+110), spawned on
  // the SAME tick as the rising body. Emitter order is draw order (ZombieArm,
  // then splash, then clumps — the arm renders behind the dirt).
  spawnZombieRise(x, y, row = -1) {
    // Arm: single mote (SpawnMinActive 1, DoOverload-style first-tick spawn),
    // dur [100 140] of the 200-tick system.
    const a = ZOMBIE_ARM_DEF;
    this.graveFx.push({
      kind: "arm", cx: x + a.offX, cy: y + a.offY, row,
      sysAge: 0, sysDur: Math.max(1, Math.round(evalPowieTrack(a.sysDurN, 0, 0.5))),
      spawned: false, mote: null,
    });
    this.spawnGraveDirt("splash", x, y, row);
    // Clumps: 6 motes up front (SpawnMinActive 6), living the whole system.
    const c = ZOMBIE_CLUMPS_DEF;
    const sysDur = Math.max(1, Math.round(evalPowieTrack(c.sysDurN, 0, 0.5)));
    const em = { kind: "clumps", cx: x, cy: y, row, sysAge: 0, sysDur, motes: [] };
    for (let i = 0; i < 6; i++) {
      em.motes.push({
        age: 0, dur: Math.max(1, Math.round(evalPowieTrack(c.durN, 0, Math.random()))),
        x: x + evalPowieTrack(c.boxXN, 0, Math.random()),
        y: y + evalPowieTrack(c.boxYN, 0, Math.random()),
        frame: Math.floor(Math.random() * 4),
        fxi: [Math.random(), Math.random()], fyi: [Math.random(), Math.random()],
        sci: Math.random(), jx: 0, jy: 0,
      });
    }
    this.graveFx.push(em);
  }
  // Per-tick hash jitter for the Shake fields (TodParticle re-seeds rand()
  // from the particle age each tick; a hash of the age is the same shape:
  // uniform [-1,1) per tick, applied at the track amplitude).
  shakeJitter(age, salt) {
    let h = (age * 2654435761 + salt * 40503 + 1) >>> 0;
    h ^= h >>> 15; h = (h * 2246822519) >>> 0; h ^= h >>> 13;
    return (h >>> 0) / 4294967296 * 2 - 1;
  }
  tickGraveArm(em) {
    const d = ZOMBIE_ARM_DEF;
    em.sysAge++;
    if (em.sysAge >= em.sysDur) return false;
    if (!em.spawned) {
      em.spawned = true;
      // USER OVERRIDE (user-specified rise timeline): the shipped
      // ParticleDuration is [100 140], so the clip-away (complete at 85% of
      // mote life) lands anywhere from tick 85 to 119 while the buried body
      // always starts emerging at tick 100 (riseT 50) — the arm usually
      // vanishes early (dead gap over bare dirt) or waves through the
      // emerging body. Pin mote life to 118 so the clip sweep (80-85%)
      // runs ticks 94-100: the arm is gone the instant the zombie begins to
      // raise, and the head pops out of the mound ~10 ticks later through
      // the rise clip. Dirt (own system) keeps churning throughout, per the
      // shipped splash/clump data.
      const dur = 118;
      em.mote = {
        age: 0, dur,
        ai: Math.random(), fyi: [Math.random(), Math.random()],
        sxi: Math.random(), syi: Math.random(), jx: 0, jy: 0, yOff: 0,
      };
    }
    const m = em.mote;
    if (m) {
      const t = m.dur <= 1 ? 1 : m.age / (m.dur - 1);
      const lastT = m.dur <= 1 ? 1 : Math.max(0, (m.age - 1) / (m.dur - 1));
      // FIELD_POSITION: pos += cur - last (evaluated at t vs last t).
      // First tick replicates FromLastTime(-1) = 0: retail seeds
      // lastTimeValue at -1, so the first delta is track(0) - 0, NOT
      // track(0) - track(0). The arm's Y track opens at -50, so the mote
      // rests 50px higher than a from-zero accumulation would put it —
      // hand waving ABOVE the dirt pile instead of buried under it.
      const cur = evalPowieTrack(d.posYN, t, m.fyi[1]);
      const last = m.age === 0 ? 0 : evalPowieTrack(d.posYN, lastT, m.fyi[1]);
      m.yOff += cur - last;
      // FIELD_SHAKE: drop last tick's jitter, add this tick's.
      const axT = evalPowieTrack(d.shakeXN, t, m.sxi), ayT = evalPowieTrack(d.shakeYN, t, m.syi);
      m.jx = this.shakeJitter(m.age, 7) * axT;
      m.jy = this.shakeJitter(m.age, 13) * ayT;
      m.age++;
      if (m.age >= m.dur) em.mote = null;
    }
    return true;
  }
  tickGraveClumps(em) {
    const d = ZOMBIE_CLUMPS_DEF;
    em.sysAge++;
    if (em.sysAge >= em.sysDur) return false;
    for (const m of em.motes) {
      const t = m.dur <= 1 ? 1 : Math.min(1, m.age / (m.dur - 1));
      const lastT = m.dur <= 1 ? 1 : Math.min(1, Math.max(0, (m.age - 1) / (m.dur - 1)));
      // First-tick last = 0 like retail FromLastTime(-1) (see tickGraveArm).
      // Clump tracks open at ~0 so the shift is only a few px of spawn
      // jitter, but it keeps the drift source-exact.
      const first = m.age === 0;
      m.x += evalPowieTrack(d.posXN, t, m.fxi[0]) - (first ? 0 : evalPowieTrack(d.posXN, lastT, m.fxi[0]));
      m.y += evalPowieTrack(d.posYN, t, m.fyi[0]) - (first ? 0 : evalPowieTrack(d.posYN, lastT, m.fyi[0]));
      m.jx = this.shakeJitter(m.age, 29) * evalPowieTrack(d.shakeXN, t, m.fxi[1]);
      m.jy = this.shakeJitter(m.age, 37) * evalPowieTrack(d.shakeYN, t, m.fyi[1]);
      m.age++;
    }
    em.motes = em.motes.filter((m) => m.age < m.dur);
    return true;
  }
  tickGraveFx(em) {
    if (em.kind === "dirt") return this.tickGraveDirt(em);
    if (em.kind === "arm") return this.tickGraveArm(em);
    return this.tickGraveClumps(em);
  }
  // Pea splat (Projectile::DoImpact -> PARTICLE_PEA_SPLAT, decoded from
  // the user's own compiled/particles/PeaSplat.xml, art particles/Peasplat.png
  // 1365x81 = 15 cels of 91x81). Retail runs ONE emitter spawning ONE
  // particle, NOT a blotch+bits burst: the whole effect is a single animated
  // strip (big burst collapsing into droplets) played via AnimationRate 2.5
  // (RenderParticle: frame = floor(animT*15), animT += 2.5*0.01 per tick and
  // wraps at 1.0 — over the 35-tick ParticleDuration it runs frames 0..13
  // once; Animated is 0 so there is no per-particle random frame). No launch
  // speed, no gravity fields, no spin (flags 0), scale constant 1; alpha
  // holds 1 through 90% of life then fades (ParticleAlpha 0.9->1, 1->0).
  // EmitterOffset (-40,-10) sits on top of the DoImpact anchor below, for
  // both attached (AddAttachedParticle: zombie-relative +52/+clamp) and
  // world (AddTodParticle) spawns. Snow keeps the legacy blotch+bits model
  // (SnowPeaSplat decode pending — untouched).
  peaSplat(p, best) {
    const snow = p.type === "snow";
    const sx = p.x - 3, sy = p.y + 12; // DoImpact: mPosX+12-15, mPosY+12
    let z = null, ox = sx, oy = sy;
    if (best) {
      z = best;
      ox = sx + 52 - best.x;
      oy = sy - best.y;
      if (best.swimming) oy += 60; // snorkel/dolphin walking in pool (pool N/A in L1-9)
      if (p.motion === "back") ox -= 80; // MOTION_BACKWARDS
      else if (p.x > best.x + 40) ox -= 60;
      oy = Math.max(20, Math.min(100, oy)); // ClampFloat
    }
    if (!snow) {
      // PeaSplat.xml: SystemDuration 35, SpawnMinActive/MaxLaunched 1,
      // ParticleDuration 35, EmitterOffset (-40,-10), Box emitter at a point.
      this.splats.push({
        z, ox: ox - 40, oy: oy - 10, dx: 0, dy: 0, vx: 0, vy: 0, age: 0, dur: 35,
        img: "peaSplat", frames: 15, frame: 0, animT: 0, animRate: 0.025,
        rot: 0, spin: 0, // no RandomLaunchSpin: spinPosition 0, spinVelocity 0
        sc: [[0, 1]],
        al: [[0, 1], [0.9, 1], [1, 0]],
        grav: 0, dragAt: 2, drag: 0,
      });
      return;
    }
    const R = 1; // snow EmitterRadius (legacy model)
    const blotch = (dx, dy) => ({
      z, ox, oy, dx, dy, vx: 0, vy: 0, age: 0, dur: 20,
      img: "snowSplat", frames: 4, frame: Math.floor(Math.random() * 4),
      rot: Math.random() * Math.PI * 2, spin: 0, // RandomLaunchSpin, no spin track
      sc: [[0, 0.4 + Math.random() * 0.2], [1, 0.8 + Math.random() * 0.4]],
      al: [[0, 0.9], [0.7, 0.9], [1, 0]],
      grav: 0, dragAt: 2, drag: 0,
    });
    const bit = (dx, dy, vx, vy) => {
      const s = 0.8 + Math.random() * 0.4;
      return {
        z, ox, oy, dx, dy, vx, vy, age: 0, dur: 30,
        img: "snowBits", frames: 3, frame: Math.floor(Math.random() * 3),
        rot: Math.random() * Math.PI * 2, spin: (Math.random() * 400 - 200) * 0.01 * Math.PI / 180,
        sc: [[0, 0.3], [0.1, s], [0.7, s], [1, 0]],
        al: [[0, 1], [0.8, 1], [1, 0]],
        grav: 0.1, dragAt: 0.4, drag: 0.1, // Accel Y=10; Friction 0.0,40 .1
      };
    };
    const polar = (r) => { const a = Math.random() * Math.PI * 2; return [Math.sin(a) * r, Math.cos(a) * r, a]; };
    { const [dx, dy] = polar(Math.random() * R); this.splats.push(blotch(dx, dy)); }
    const n = 6 + Math.floor(Math.random() * 5); // [6 10]
    for (let i = 0; i < n; i++) {
      const [dx, dy, a] = polar(Math.random() * R);
      this.splats.push(bit(dx, dy, Math.sin(a) * 1.5, Math.cos(a) * 1.5)); // LaunchSpeed 150
    }
  }
  // Projectile::DoImpact PARTICLE_CABBAGE_SPLAT (Projectile.cpp:880-884):
  // the anchor rides the pre-move position (aLastPos = mPos - mVel:
  // mPosX-velX-38, mPosY+mPosZ-velY-velZ+23), then the standard attached /
  // world split (898-924) — with the MOTION_LOBBED gate (912): lobbed shots
  // never take the backwards -80 or the +40/-60 victim-side shift, and the
  // height clamps to [20,100] like every splat. Decoded from main.zip
  // compiled/particles/Cabbagesplat.xml.compiled (DefMap layout from
  // Definition.cpp gEmitterDefFields): ONE Box emitter, IMAGE_CABBAGEPULT,
  // ImageFrames 10, SystemDuration 50, ParticleDuration 50, SpawnMinActive /
  // MaxLaunched 1, EmitterOffset (+10,-10), ParticleAlpha [(0.9,1),(1,0)],
  // ParticleScale 1, AnimationRate 2. So: 50-tick life, frame =
  // floor(animT*10) with animT += 0.02/tick (AnimationRate*0.01, wrapping at
  // 1.0 like RenderParticle), and since the strip only holds 8 cels the last
  // two frames clamp onto cel 7 (aFrame >= mNumCols -> NumCols-1) — modeled
  // here with frames:10 for timing plus cels:8 for the art.
  cabbageSplat(l, best) {
    const sx = l.x - l.velX - 38, sy = l.y - l.velZ + 23;
    let z = null, ox = sx + 10, oy = sy - 10; // EmitterOffsetX/Y (+10,-10)
    if (best) {
      z = best;
      ox = sx + 52 - best.x + 10;
      oy = sy - best.y - 10;
      if (best.swimming) oy += 60; // snorkel/dolphin walking in pool
      oy = Math.max(20, Math.min(100, oy)); // ClampFloat
    }
    this.splats.push({
      z, ox, oy, dx: 0, dy: 0, vx: 0, vy: 0, age: 0, dur: 50,
      img: "cabbageSplat", frames: 10, cels: 8, frame: 0, animT: 0, animRate: 0.02,
      rot: 0, spin: 0, // no RandomLaunchSpin: spinPosition 0, spinVelocity 0
      sc: [[0, 1]],
      al: [[0, 1], [0.9, 1], [1, 0]],
      grav: 0, dragAt: 2, drag: 0,
    });
  }
  // Projectile::DoImpact PARTICLE_PUFF_SPLAT (Projectile.cpp:875-879: the
  // anchor shifts -20, then attaches exactly like the pea splat above) from
  // PuffSplat.xml: 6-10 bits of IMAGE_PUFFSHROOM_PUFF2, 20-tick life, scale
  // .6-.8, LaunchSpeed 50-100, Friction 0.0/40/.1, Acceleration Y=3,
  // RandomLaunchSpin with ParticleSpinSpeed +/-200.
  puffSplat(p, best) {
    const sx = p.x - 20, sy = p.y + 12;
    let z = null, ox = sx, oy = sy;
    if (best) {
      z = best;
      ox = sx + 52 - best.x;
      oy = sy - best.y;
      if (best.swimming) oy += 60; // snorkel/dolphin walking in pool
      if (p.x > best.x + 40) ox -= 60;
      oy = Math.max(20, Math.min(100, oy)); // ClampFloat
    }
    const bit = (dx, dy, vx, vy) => ({
      z, ox, oy, dx, dy, vx, vy, age: 0, dur: 20,
      img: "puffBits", frames: 1, frame: 0,
      rot: Math.random() * Math.PI * 2, spin: (Math.random() * 400 - 200) * 0.01 * Math.PI / 180,
      sc: [[0, 0.6 + Math.random() * 0.2]],
      al: [[0, 1], [0.8, 1], [1, 0]],
      grav: 0.03, dragAt: 0.4, drag: 0.1,
    });
    const polar = (r) => { const a = Math.random() * Math.PI * 2; return [Math.sin(a) * r, Math.cos(a) * r, a]; };
    const n = 6 + Math.floor(Math.random() * 5); // [6 10]
    for (let i = 0; i < n; i++) {
      const [dx, dy, a] = polar(Math.random() * 10); // EmitterRadius [0 10]
      const sp = 0.5 + Math.random() * 0.5; // LaunchSpeed [50 100]
      this.splats.push(bit(dx, dy, Math.sin(a) * sp, Math.cos(a) * sp));
    }
  }
  // Projectile::DoImpact PARTICLE_STAR_SPLAT (Projectile.cpp:872-873, no
  // anchor shift — the star keeps mPosX+12/mPosY+12, unlike the pea -15 and
  // puff -20) from the user's own StarSplat.xml (main.zip
  // compiled/particles/): two Circle emitters, both 20-tick life / 20-tick
  // system, RenderParticle-style centered + rotated + scaled normal-blend
  // motes (same draw path as the pea/puff splats in main.js).
  starSplat(p, best) {
    // StarSplat emitter 1: ONE mote of IMAGE_STAR_SPLATS
    // (particles/Star_splats.png, 4 cels of 24x24), EmitterRadius [0 10],
    // no launch speed, RandomLaunchSpin (initial angle only — no
    // ParticleSpinSpeed track, so spin velocity 0, like the snow blotch),
    // ParticleScale [.4 .6] -> [.8 1.2] (start/end randoms),
    // ParticleAlpha .9 hold to 70% then fade.
    const sx = p.x + 12, sy = p.y + 12; // DoImpact: mPosX+12, mPosY+12
    let z = null, ox = sx, oy = sy;
    if (best) {
      z = best;
      ox = sx + 52 - best.x;
      oy = sy - best.y;
      if (best.swimming) oy += 60; // snorkel/dolphin walking in pool
      if (p.motion === "back") ox -= 80; // MOTION_BACKWARDS (star itself never is)
      else if (p.x > best.x + 40) ox -= 60;
      oy = Math.max(20, Math.min(100, oy)); // ClampFloat
    }
    {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 10;
      const s0 = 0.4 + Math.random() * 0.2, s1 = 0.8 + Math.random() * 0.4;
      this.splats.push({
        z, ox, oy, dx: Math.sin(a) * r, dy: Math.cos(a) * r, vx: 0, vy: 0, age: 0, dur: 20,
        img: "starSplat", frames: 4, frame: Math.floor(Math.random() * 4),
        rot: Math.random() * Math.PI * 2, spin: 0, // RandomLaunchSpin only, no spin track (snow-blotch convention)
        sc: [[0, s0], [1, s1]],
        al: [[0, 0.9], [0.7, 0.9], [1, 0]],
        grav: 0, dragAt: 2, drag: 0, // no Friction field on the blotch emitter
      });
    }
    // StarSplat emitter 2 (StarSplatBits): [6 10] motes of
    // IMAGE_STAR_PARTICLES (particles/Star_particles.png, 3 cels of 11x11),
    // LaunchSpeed [150] (1.5 px/tick), Friction 0.0,40 .1, Acceleration Y=10
    // (grav 0.1), RandomLaunchSpin + ParticleSpinSpeed [-200 200],
    // ParticleScale [.8 1.2], ParticleAlpha 1 hold to 80% then fade.
    const bit = (dx, dy, vx, vy) => ({
      z, ox, oy, dx, dy, vx, vy, age: 0, dur: 20,
      img: "starBits", frames: 3, frame: Math.floor(Math.random() * 3),
      rot: Math.random() * Math.PI * 2, spin: (Math.random() * 400 - 200) * 0.01 * Math.PI / 180,
      sc: [[0, 0.8 + Math.random() * 0.4]],
      al: [[0, 1], [0.8, 1], [1, 0]],
      grav: 0.1, dragAt: 0.4, drag: 0.1,
    });
    const polar = (r) => { const a = Math.random() * Math.PI * 2; return [Math.sin(a) * r, Math.cos(a) * r, a]; };
    const m = 6 + Math.floor(Math.random() * 5); // SpawnMinActive [6 10]
    for (let i = 0; i < m; i++) {
      const [dx, dy, a] = polar(Math.random() * 10); // EmitterRadius [0 10]
      this.splats.push(bit(dx, dy, Math.sin(a) * 1.5, Math.cos(a) * 1.5)); // LaunchSpeed [150]
    }
  }
  // PARTICLE_PUFFSHROOM_MUZZLE (Plant::Fire 4713-4722, one-shot at the
  // origin + (18,13) puff / +(27,13) scaredy): PuffShroomMuzzle.xml is a
  // single Circle system — 6-8 motes of IMAGE_PUFFSHROOM_PUFF2, 20-tick
  // life, LaunchSpeed 0, Friction 0.0,40 .1 (dragAt 0.4 / drag 0.1),
  // Acceleration Y=5 (vy += 0.05), Position drift X total +[20 40] / Y total
  // [-30 20] (FIELD_POSITION adds the track delta per tick, unfrictioned),
  // random launch spin + spin [-200 200], alpha rand [.3 .8] held to 80%
  // then fading, scale [.2 .3] growing to [.6 .8] at 70% then shrinking to
  // 0. Deviation noted: the two scale stops roll their own randoms instead
  // of the single per-track interp (visually identical), and the mote count
  // reads [6 8] as 6..8 while the (int) cast gives 6..7.
  puffMuzzle(x, y) {
    const n = 6 + Math.floor(Math.random() * 3); // SpawnMinActive [6 8]
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 5; // EmitterRadius [0 5]
      const a0 = 0.3 + Math.random() * 0.5;
      this.splats.push({
        z: null, p: null, ox: x + Math.sin(a) * r, oy: y + Math.cos(a) * r,
        dx: 0, dy: 0, vx: 0, vy: 0, // LaunchSpeed 0
        fx: (20 + Math.random() * 20) / 20, fy: (-30 + Math.random() * 50) / 20,
        age: 0, dur: 20, img: "puffBits", frames: 1, frame: 0,
        rot: Math.random() * Math.PI * 2, spin: (Math.random() * 400 - 200) * 0.01 * Math.PI / 180,
        sc: [[0, 0.2 + Math.random() * 0.1], [0.7, 0.6 + Math.random() * 0.2], [1, 0]],
        al: [[0, a0], [0.8, a0], [1, 0]],
        grav: 0.05, dragAt: 0.4, drag: 0.1,
      });
    }
  }
  // PARTICLE_PUFFSHROOM_TRAIL (Projectile ctor 109-113: attached at
  // mPosX+13,mPosY+13, i.e. the system center rides the spore): the
  // PuffShroomTrail.xml emitter loops (SystemLoops 1, SystemDuration 20),
  // spawning at SpawnRate 20 (x0.01 = 0.2 motes/tick, no max cap) for as
  // long as the projectile lives. Motes are IMAGE_PUFFSHROOM_PUFF2 in a
  // Circle r [0 10], LaunchSpeed [10] (0.1 px/tick random dir), 20-tick
  // life, Acceleration Y=5, Position X total +20 drift, random spin
  // [-600 600], alpha 1 -> rand [.4 .8] at 80% -> 0, scale .3 -> rand
  // [.4 1.0] at 10% -> same at 70% -> 0. ParticlesDontFollow: motes keep
  // their world spawn (they do NOT ride the spore), so the mote stores the
  // world anchor and only keeps the proj ref for the death sweep
  // (ParticleSystemDie kills the motes with their system). Deviations
  // noted: the EaseOut curve on the X drift is linearized (curves are
  // unmodeled everywhere in this port), and the FadeOut crossfade target
  // is skipped — motes simply die at 20.
  puffTrail(p) {
    p.trailAccum += 0.2; // SpawnRate 20 x0.01
    let n = Math.floor(p.trailAccum); p.trailAccum -= n;
    const cx = p.x + 13, cy = p.y + 13; // AttachParticle offset (13,13)
    while (n-- > 0) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 10; // EmitterRadius [0 10]
      const la = Math.random() * Math.PI * 2, sp = 0.1; // LaunchSpeed [10] x0.01
      const sci = Math.random(), ai = Math.random();
      this.splats.push({
        z: null, p, ox: cx + Math.sin(a) * r, oy: cy + Math.cos(a) * r,
        dx: 0, dy: 0, vx: Math.sin(la) * sp, vy: Math.cos(la) * sp,
        fx: 1.0, fy: 0, // Position X "0 EaseOut 20" linearized: +20 over life
        age: 0, dur: 20, img: "puffBits", frames: 1, frame: 0,
        rot: Math.random() * Math.PI * 2, spin: (Math.random() * 1200 - 600) * 0.01 * Math.PI / 180,
        sc: [[0, 0.3], [0.1, 0.4 + sci * 0.6], [0.7, 0.4 + sci * 0.6], [1, 0]],
        al: [[0, 1], [0.8, 0.4 + ai * 0.4], [1, 0]],
        grav: 0.05, dragAt: 2, drag: 0, // no Friction field
      });
    }
  }
  impactSfx(p, best) {
    // Projectile::PlayImpactSound (Projectile.cpp:764): fireball splash ->
    // FOLEY_IGNITE only (779-784); a fire-resistant direct hit keeps the
    // helm + splat path (aPlayHelmSound/aPlaySplatSound stay true).
    if (p.type === "fire" && this.isSplashDamage(p, best)) { this.sfx(this.ignitePick()); return; }
    // Projectile::PlayImpactSound (Projectile.cpp:764): the helm path
    // (bucket SHIELD_HIT / cone-football-digger PLASTIC_HIT + splat) runs for
    // every type — the old shortcut below skipped it for all non-pea shots.
    // Star joins the helm path like the peas (cactus + cattail spikes);
    // cabbage/kernel/butter/melon keep the existing shortcut (out of scope).
    if (p.type !== "pea" && p.type !== "snow" && p.type !== "fire" && p.type !== "spike" && p.type !== "star") { this.sfx("splat"); return; }
    if (best.type === "bucket" && best.helm > 0) this.sfx(Math.random() < 0.5 ? "shieldhit" : "shieldhit2");
    else {
      if (best.helm > 0 && (best.type === "cone" || best.type === "football" || best.type === "digger"))
        this.sfx(Math.random() < 0.5 ? "plastichit" : "plastichit2");
      this.sfx(["splat", "splat2", "splat3"][Math.floor(Math.random() * 3)]);
    }
  }
  // Wallnut-eat particles (AnimateChewEffect 4800 + AnimateNuts 3157/3165):
  // WallnutEatSmall.xml (per-bite, Circle r[0,10]) + WallnutEatLarge.xml
  // (stage change, Box offX[-30,10] offY[-10,30]) — user's main.zip art
  // (WallnutParticlesSmall 5x8x8 / Large 5x18x18). Both: rate 50/40 x0.01,
  // maxLaunched 6/3, dur [30,60], sysDur 200, speed [100,120] x0.01 at
  // angle [180,210] (0 = straight down, so the bits fly UP out of the bite),
  // gravity field Y=8 (vy += 0.08/tick), Position-X drift totaling rand
  // [-40,10] over the mote's life (FIELD_POSITION adds the track delta per
  // tick — TodParticle.cpp:502), random launch spin + spin speed
  // (small ±1400, large ±600, x0.01 deg/tick), scale [0.9,1.1], static
  // random frame (ImageFrames 5, not animated), alpha + system alpha both
  // hold 1 to 80% then fade to 0. Ticked like TodParticleEmitter::Update;
  // spent systems sweep with their motes (like the powie systems).
  spawnWallnutEat(x, y, big) {
    this.wallnutEats.push({
      big, cx: x, cy: y, sysAge: 0, sysDur: 200,
      accum: 0, spawned: 0, maxLaunch: big ? 6 : 3, rate: (big ? 50 : 40) * 0.01,
      motes: [],
    });
  }
  spawnWallnutEatMote(em) {
    const R = Math.random;
    const m = {
      dur: 30 + Math.floor(R() * 31), age: 0, // [30 60]
      frame: Math.floor(R() * 5), // ImageFrames 5, Animated 0
      spin: R() * Math.PI * 2, // PARTICLE_RANDOM_LAUNCH_SPIN
      spinVel: (R() * 2 - 1) * (em.big ? 600 : 1400) * 0.01 * Math.PI / 180,
      sc: 0.9 + R() * 0.2, // ParticleScale [.9 1.1]
      driftX: -40 + R() * 50, driftT: 0, // Position X "0 [-40 10]" total drift
    };
    if (em.big) { m.x = em.cx - 30 + R() * 40; m.y = em.cy - 10 + R() * 40; } // Box
    else { const r = R() * 10, a = R() * Math.PI * 2; m.x = em.cx + Math.sin(a) * r; m.y = em.cy + Math.cos(a) * r; } // Circle
    const th = (180 + R() * 30) * Math.PI / 180, sp = (100 + R() * 20) * 0.01;
    m.vx = Math.sin(th) * sp; m.vy = Math.cos(th) * sp; // LaunchAngle 0 = +y = down
    em.motes.push(m);
  }
  tickWallnutEat(em) {
    em.sysAge++;
    const die = em.sysAge >= em.sysDur;
    for (const m of em.motes) {
      // UpdateParticle (516F00): fields, then position += velocity, spin, age.
      const t = m.dur <= 1 ? 1 : m.age / (m.dur - 1);
      m.vy += 0.08; // FIELD_ACCELERATION Y=8
      const dt = Math.min(1, t + 1 / (m.dur - 1)) - t; // FIELD_POSITION delta slice
      m.driftT += dt; m.x += m.driftX * dt;
      m.x += m.vx; m.y += m.vy;
      m.spin += m.spinVel;
      m.age++;
    }
    em.motes = em.motes.filter((m) => m.age < m.dur);
    if (die) return false;
    em.accum += em.rate;
    let n = Math.floor(em.accum); em.accum -= n;
    n = Math.min(n, em.maxLaunch - em.spawned);
    for (let i = 0; i < n; i++) { this.spawnWallnutEatMote(em); em.spawned++; }
    return true;
  }
  // Planting dirt burst (Board::DoPlantingEffects -> PARTICLE_PLANTING, art
  // IMAGE_DIRTSMALL = dirtsmall.png, 16 cels of 40x40; pool variant is
  // PARTICLE_PLANTING_POOL, art IMAGE_WATERPARTICLE = waterparticle.png,
  // 6 cels of 40x40, byte-identical from main.zip images/). No particle
  // engine in this port (same as flashes/debris), so motes integrate here:
  // pop up/out, gravity, stick at the furrow, fade out. Counts/curves
  // approximate the retail emitters (the compiled Planting/PlantingPool XML
  // params were not decoded — binary Definition format); spawn point + sfx
  // routing above are source-exact.
  spawnDirt(x, y, water = false) {
    const n = 10 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const sp = 1 + Math.random() * 2.4;
      const life = 35 + Math.floor(Math.random() * 25);
      this.dirt.push({
        x: x + (Math.random() - 0.5) * 20, y: y - Math.random() * 6, y0: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life, max: life, cel: water ? Math.floor(Math.random() * 6) : Math.floor(Math.random() * 16),
        s: 0.35 + Math.random() * 0.25, water,
      });
    }
  }
  // Squash landing dust (PARTICLE_DUST_SQUASH, UpdateSquash 1603): the motes
  // billow out/up from the impact, expand and fade over ~30-50 ticks.
  // Counts/curves approximate the emitter (the compiled Dust_Squash XML is a
  // binary Definition blob — the port convention is to approximate, like
  // spawnDirt above); the spawn point is source-exact. Art is Dust_puffs.png
  // (3 cels of 32x27, main.zip particles/ byte-identical). Transient: never
  // saved (like every other fx system).
  spawnSquashDust(x, y) {
    const n = 8 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const sp = 0.8 + Math.random() * 1.8;
      const life = 30 + Math.floor(Math.random() * 21);
      this.squashDust.push({
        x: x + (Math.random() - 0.5) * 30, y: y - Math.random() * 8,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7,
        life, max: life, cel: Math.floor(Math.random() * 3),
        s: 0.5 + Math.random() * 0.3,
      });
    }
  }
  collectCoin(c) {
    if (c.isSun()) {
      const before = this.sun;
      this.addSunMoney(c.value);
      this.onSunCollected();
      // Coin::MouseDown (1260-1271): the sun that newly covers a packet's
      // cost flashes it ready (sparkle + REFRESH->PICK_UP) — this is what
      // advances the L1 tutorial once the 100-sun peashooter is affordable,
      // not the recharge completing while poor.
      if (!this.isConveyor) {
        const seeds = new Set([...this.fixedBank(), ...Object.keys(this.recharge).map(Number)]);
        for (const s of seeds) {
          if (before < PLANTS[s].cost && this.sun >= PLANTS[s].cost) this.flashIfReady(s);
        }
      }
    }
    else this.money += c.money;
    // No arrival stinger: the pickup sound already played on click
    // (Coin::MouseDown PlayCollectSound — sun FOLEY_SUN, silver/gold
    // FOLEY_COIN, diamond SOUND_DIAMOND; see the click handler in main.js).
  }
  // Board::AddSunMoney (Board.cpp:8650) — all sun income clamps at 9990.
  // USER OVERRIDE: the cap is 9999 instead of the source 9990.
  addSunMoney(amount) {
    this.sun += amount;
    if (this.sun > 9999) this.sun = 9999;
  }
  dropZombieLoot(z) {
    // Zombie::DropLoot yeti branch (7240-7247) + Board::DropLootPiece
    // (9452-9568): normal loot is money coins ONLY — never sun (the only
    // sun branch is the out-of-scope whack-a-mole minigame). The
    // CanDropLoot gate lives in Zombie.dropLoot (7223); this runs only
    // when loot may drop.
    if (z.type === "yeti") {
      for (let i = 0; i < 4; i++) this.addCoin(z.hitCX() - (20 + i * 10), z.y + 40, "diamond"); // aCenterX - 20/-30/-40/-50 (7243-7246)
      return;
    }
    // Retail throws the imp mid-fight, not on death (out-of-scope levels —
    // garg first appears at 48); kept on death so the imp still appears.
    // Garg loot itself goes through DropLootPiece like every non-yeti (7248-7251).
    if (z.type === "garg") this.spawnZombie("imp", z.row, z.wave, z.x - 100);
    // DropLootPiece: Rand(30000) against per-value chances (diamond 14,
    // gold 250, silver 2500, all x zombie value). The diamond slot pays
    // gold until the packet upgrade is bought (9539). Potted plants and
    // chocolate need the zen garden (absent here, chances 0); the L11
    // first-coin guarantee and L22/L36 present drops are out of the 1-9
    // scope. Bowling levels drop no money at all (9551).
    this.dropLootRoll(z.hitCX() - 40, z.y + 40, ROSTER[z.type].value);
  }
  // Board::DropLootPiece money roll (Board.cpp:9452-9568), shared by zombie
  // loot (factor = zombie value) and the gravebuster clear (factor 12 at
  // mX+40,mY, UpdateGraveBuster 1118 — AddCoin(thePosX-40, thePosY) lands it
  // at the plant corner, so callers pass the already-shifted anchor).
  // Every successful drop pops FOLEY_SPAWN_SUN (= SOUND_THROW, TodFoley.cpp:14)
  // BEFORE AddCoin (9565; the whack sun window pops it at 9486) — so diamond
  // loot layers throw + the ctor's FOLEY_CHIME, exactly like retail.
  dropLootRoll(ax, ay, factor) {
    const roll = Math.floor(Math.random() * 30000);
    // Whack-a-Zombie sun window (Board::DropLootPiece 9480-9491): before the
    // money table, roll against [2500*f, max*f] where max rides the bank
    // (500->2800, 350->3100, 200->3700, else 5000). Hit spawns 3 suns at
    // center-20/-40/-60 (our ax is already center-40, so +20/0/-20) and
    // returns.
    if (this.isWhack) {
      const max = this.sun > 500 ? 2800 : this.sun > 350 ? 3100 : this.sun > 200 ? 3700 : 5000;
      if (roll >= 2500 * factor && roll <= max * factor) {
        this.sfx("throw"); // FOLEY_SPAWN_SUN (Board::DropLootPiece 9486)
        this.addCoin(ax + 20, ay, "sun");
        this.addCoin(ax, ay, "sun");
        this.addCoin(ax - 20, ay, "sun");
        return;
      }
    }
    let kind = null;
    if (roll < 14 * factor) kind = this.packetUpgrade < 1 ? "gold" : "diamond";
    else if (roll < 250 * factor) kind = "gold";
    else if (roll < 2500 * factor) kind = "silver";
    else return;
    if (this.isBowling) return; // IsWallnutBowlingLevel && IsMoney (9551)
    this.sfx("throw"); // FOLEY_SPAWN_SUN (Board::DropLootPiece 9565)
    this.addCoin(ax, ay, kind);
  }
  // Board::CanDropLoot (9571): no regular loot on first-time adventure below
  // level 11. (No upsell boards in this port, so that clause is dropped.)
  canDropLoot() { return !this.firstTime || this.level >= 11; }
  // AlmanacInitForPlayer / AlmanacPlayerDefeatedZombie (AlmanacDialog 674-683):
  // record a zombie kill by almanac index (0..25). The type->index map mirrors
  // ConstEnums ZombieType order (INVALID -1, NORMAL 0 .. BOSS 25).
  noteZombieDefeated(z) {
    const i = ZOMBIE_ALMANAC_IDX[z.type];
    if (i !== undefined) this.zombieDefeated.add(i);
  }
  // Board::CountZombiesOnScreen (Board.cpp:271): headed, not dead/dying
  // (mowed/burned count as dying via IsDeadOrDying), not mind-controlled,
  // on the board. Gates the newspaper rarrgh (UpdateZombieNewspaper 1640).
  countZombiesOnScreen() {
    let n = 0;
    for (const z of this.zombies) {
      if (z.hasHead && !z.dead && !z.mowed && z.burnT <= 0 && !z.ally && z.row >= 0) n++;
    }
    return n;
  }
  // FOLEY_NEWSPAPER_RARRGH set-pick (TodFoley.cpp:76): [RARRGH, RARRGH2,
  // RARRGH2] — the second variant is twice as likely. Pitch -2 (same row).
  rarrghPick() {
    const r = Math.floor(Math.random() * 3);
    return r === 0 ? "newspaper" : "newspaper2";
  }
  // FOLEY_JACK_SURPRISE set-pick (TodFoley.cpp:44): [JACK_SURPRISE x2,
  // JACK_SURPRISE2] — surprise2 at 1/3. Pitch 1.0 (audio.js PITCH table, so
  // call sites pass no explicit pitch).
  jackSurprisePick() {
    return Math.random() < 1 / 3 ? "jackSurprise2" : "jackSurprise";
  }
  // FOLEY_THROW set-pick (TodFoley.cpp:13): [THROW x3, THROW2] — every
  // Plant::Fire (4588), StarFruitFire (908) and torchwood melt (ConvertToPea
  // 1233). Pitch 10 (same key). FOLEY_SPAWN_SUN's lone SOUND_THROW and the
  // raw PlaySample(SOUND_THROW) are NOT picks — those call sites stay flat.
  throwPick() {
    return Math.random() < 0.25 ? "throw2" : "throw";
  }
  // FOLEY_IGNITE set-pick (TodFoley.cpp:48): [IGNITE x3, IGNITE2] — fireball
  // impact only (PlayImpactSound 779-784). Pitch 5 (same key).
  ignitePick() {
    return Math.random() < 0.25 ? "ignite2" : "ignite";
  }
  // FOLEY_SQUASH_HMM set-pick (TodFoley.cpp): [HMM, HMM, HMM2] — the first
  // variant twice as likely (audio.js hmm/hmm2, both byte-identical main.zip).
  squashHmmPick() {
    return Math.floor(Math.random() * 3) === 2 ? "hmm2" : "hmm";
  }
  // Zombie::TrySpawnLevelAward (7070-7208): the last kill of the level drops
  // the award as a collectible coin at the zombie's rect center. Gates:
  // on-board, no award yet, level not over, zombie hasn't dropped, final
  // wave reached, and no other headed living non-hypno enemy on screen
  // (AreEnemyZombiesOnScreen 257 — the dying zombie is headless by now, so it
  // never counts itself). Boss/scary-potter branches are out of scope; the
  // whack gate (7096: mZombieCountDown > 0 blocks) IS ported — on the whack
  // board the final wave's 20 grave summons are still pending while the
  // counter runs down, and those pending summons are not zombies on screen
  // yet, so without this gate the last pre-final kill drops the award early.
  // Sets mLevelAwardSpawned, clears the lawn lootless (RemoveAllZombies
  // 2701 -> DieNoLoot each), spawns the award with COIN_MOTION_COIN. Silent
  // like source (TrySpawnLevelAward plays nothing; the seed/shovel/note
  // pickup sounds fire on click in collectAward, and their CoinInitialize
  // plays no launch sound).
  trySpawnLevelAward(z) {
    if (this.levelAwardSpawned || this.state === "won" || this.state === "lost") return false;
    if (this.isVase) return false; // vase wins only via the final vase (spawnVaseAward)
    if (this.isIntro || z.droppedLoot) return false;
    if (this.currentWave < this.numWaves) return false;
    // Whack-a-Zombie (7096): pending grave summons are not on screen yet —
    // block the award while the spawn counter is still running.
    if (this.isWhack && this.zombieCd > 0) return false;
    // Grave rises still running (mRiseFromGraveCounter) are not on screen
    // yet — block the award while the spawn counter runs.
    if (this.riseCounter > 0) return false;
    // No headed living enemies left (IsDeadOrDying gate: the dying fall sets
    // dead, headless bleed-outs fail hasHead, and mowed flippers — still
    // dead=false mid-flip — must not block each other when the same mower
    // takes the last two teeth ticks apart).
    if (this.zombies.some((o) => o !== z && o.hasHead && !o.dead && !o.gone && !o.ally && !o.mowed && o.burnT <= 0)) return false;
    this.levelAwardSpawned = true;
    z.droppedLoot = true; // DropLoot 7223: regular loot is skipped once the award spawns
    for (const o of this.zombies) if (o !== z && !o.dead) o.die(true);
    // Award table, first-time adventure <= 50 (7119-7156): L4 shovel, L9/19/29/39/49
    // note, L34 taco, else the final seed packet. Finished-adventure money-bag
    // replays and the L14/24/44 gifts are out of scope (follow-up with the
    // profile-reset change they need).
    const isNote = this.level === 9 || this.level === 19 || this.level === 29 || this.level === 39 || this.level === 49;
    // Zombie::TrySpawnLevelAward (7133-7148): L4 shovel, L34 taco, notes above.
    const kind = this.level === 4 ? "award-shovel" : this.level === 34 ? "award-taco" : isNote ? "award-note" : "award-seed";
    const aw = kind === "award-shovel" || kind === "award-taco" ? 80 : kind === "award-note" ? 109 : 50; // click-box widths (IMAGE_TACO 80x80)
    const c = new Coin(this, kind, z.hitCX() - aw / 2, z.y + 40, "coin");
    if (kind === "award-seed") c.seed = awardSeedForLevel(this.level);
    this.coins.push(c);
    return true;
  }
  // Coin::Collect award branch (1152-1237): the click collects the award and
  // starts the end sequence (Board::FadeOutLevel 1858). Per-type sfx: seed
  // SEEDLIFT + TAP2 (raw samples), L4 shovel SOUND_SHOVEL (raw sample, flat),
  // note default branch.
  // Pickup fx: STARBURST one-shot above the coin (1214, all awards) +
  // PRESENT_PICKUP burst + StartFade for the note (1223-1226, no attached
  // system) vs the Award.xml attached system (beams/glow/flashes) riding the
  // coin into its center flight for everything else (1232).
  collectAward(c) {
    // Coin::Collect IsLevelAward (1152-1212): the seed/note click plays
    // SEEDLIFT + TAP2 (raw samples); the L4 shovel plays SOUND_SHOVEL only
    // (1190-1193, PlaySample — flat, no pitch range).
    if (c.kind === "award-shovel") this.sfx("shovel", 1, 0);
    // Coin::Collect (1194-1197): first-time L24/L34/L44 plays SOUND_TAP2 only.
    // L34 is the taco (IMAGE_TACO 80x80); L24/44 gifts are out of scope, so
    // the kind gate covers every taco this port can spawn.
    else if (c.kind === "award-taco") this.sfx("drop");
    else { this.sfx("seedlift"); this.sfx("drop"); }
    c.collected = true; c.collectX = c.x; c.collectY = c.y; c.flyT = 0;
    this.spawnAwardPickup(c);
    // COIN_NOTE (1223-1226): no attached system, no center flight — the note
    // fades out over 15 ticks and is gone (Coin::UpdateFade 458-466: the
    // NOTE branch ticks mFadeCount down to Die). update() serves fadeCount
    // before the collect flight, so the flight never runs.
    if (c.kind === "award-note") c.fadeCount = 15;
    this.fadeOutLevel();
  }
  // Award click-box widths (Coin.cpp:3495-3496, shared with dropZombieLoot).
  // Main.zip pickup boxes (user request — pickups stay main.zip, only the
  // award screen itself is retail): seeds 50x70, shovel 80x80, note 109x94.
  awardSize(kind) {
    // Coin::CoinInitialize COIN_TACO (158-162): IMAGE_TACO w/h (main.zip
    // images/Taco.png, 80x80), ABOVE_UI like the other awards.
    return kind === "award-shovel" ? [80, 80] : kind === "award-taco" ? [80, 80] : kind === "award-note" ? [109, 94] : [50, 70];
  }
  // Award pickup fx (Coin::Collect IsLevelAward, Coin.cpp:1152-1237): the
  // STARBURST burst (Starburst.xml, SystemDuration 50, mRenderOrder+1) fires
  // for EVERY award including the note (1214). The note then gets its own
  // PRESENT_PICKUP burst + StartFade (1223-1226) and NO attached Award.xml
  // system — no beams, no glow, no flashes, no center flight. Everything
  // else attaches PARTICLE_SEED_PACKET_PICKUP (the Award.xml system,
  // ParticleDuration 1500, mRenderOrder-1) which rides the coin through its
  // center flight.
  // No particle engine in this port, so emitters integrate here
  // (TodParticleEmitter::Update/SpawnParticle/UpdateParticle/GetRenderParams).
  // Track times are fractions 0..1 (mSystemTimeValue = age/(dur-1)); launch
  // speeds x0.01 px/tick; launch angle 0 = straight down (x=sin, y=cos,
  // angle measured down-positive); spin track x0.01 deg/tick.
  spawnAwardPickup(c) {
    const [w, h] = this.awardSize(c.kind);
    const cx = c.x + w / 2, cy = c.y + h / 2;
    // STARBURST (Starburst.xml): 25 + 20 STAR40 + 5 AWARDRAYS_STAR, ring
    // 1-75, speed 5-18, friction .05, gravity +.005/tick, scale .1-.3, fast
    // random initial spin settling toward +/-90-720deg/s by 80% of life,
    // additive; system alpha holds 1 to 80% then fades (all 50 outlive it).
    const defs = [
      { img: "star", n: 25, r: 1, g: 0.9, b: () => Math.random() * 0.4 },
      { img: "star", n: 20, r: 1, g: 1, b: () => 0.6 + Math.random() * 0.2 },
      { img: "raystar", n: 5, r: 1, g: () => 0.6 + Math.random() * 0.1, b: 0 },
    ];
    for (const d of defs) for (let i = 0; i < d.n; i++) {
      const a = Math.random() * Math.PI * 2, rad = 1 + Math.random() * 74;
      const sp = 5 + Math.random() * 13, si = Math.random(), D2R = Math.PI / 180;
      this.bursts.push({
        img: d.img, x: c.x + 30 + Math.sin(a) * rad, y: c.y + 30 + Math.cos(a) * rad,
        vx: Math.sin(a) * sp, vy: Math.cos(a) * sp,
        rot: Math.random() * Math.PI * 2, // PARTICLE_RANDOM_LAUNCH_SPIN
        v0: (-720 + 1440 * si) * 0.01 * D2R, v1: (-90 + 180 * si) * 0.01 * D2R,
        scale: 0.1 + Math.random() * 0.2,
        r: d.r, g: typeof d.g === "function" ? d.g() : d.g, b: typeof d.b === "function" ? d.b() : d.b,
        grav: 0.005, age: 0, dur: 50, // FIELD_ACCELERATION Y 0.5x0.01
      });
    }
    // COIN_NOTE (Coin::Collect 1223-1226): PRESENT_PICKUP at the coin center
    // instead of the attached Award.xml system — no beams, no glow, no
    // flashes, no flight (collectAward runs StartFade right after this).
    // PresentPickup.xml: same 25+20+5 STAR40/rays counts and colors as
    // STARBURST, but tighter (ring 1-50), chunkier (scale .2-.5), slower
    // (speed 3-6) and heavier (gravity .05 vs .005).
    if (c.kind === "award-note") {
      const pdefs = [
        { img: "star", n: 25, r: 1, g: 0.9, b: () => Math.random() * 0.4 },
        { img: "star", n: 20, r: 1, g: 1, b: () => 0.6 + Math.random() * 0.2 },
        { img: "raystar", n: 5, r: 1, g: () => 0.6 + Math.random() * 0.1, b: 0 },
      ];
      for (const d of pdefs) for (let i = 0; i < d.n; i++) {
        const a = Math.random() * Math.PI * 2, rad = 1 + Math.random() * 49, sp = 3 + Math.random() * 3, si = Math.random(), D2R = Math.PI / 180;
        this.bursts.push({
          img: d.img, x: c.x + 30 + Math.sin(a) * rad, y: c.y + 30 + Math.cos(a) * rad,
          vx: Math.sin(a) * sp, vy: Math.cos(a) * sp,
          rot: Math.random() * Math.PI * 2, // PARTICLE_RANDOM_LAUNCH_SPIN
          v0: (-720 + 1440 * si) * 0.01 * D2R, v1: (-90 + 180 * si) * 0.01 * D2R,
          scale: 0.2 + Math.random() * 0.3,
          r: d.r, g: typeof d.g === "function" ? d.g() : d.g, b: typeof d.b === "function" ? d.b() : d.b,
          grav: 0.05, age: 0, dur: 50,
        });
      }
      return;
    }
    // Award.xml attached system (no SystemDuration -> defaults to
    // ParticleDuration = 1500): 8 ray emitters (image/brightness/spin per
    // AwardRay1-8), the glow, and 4 single-shot flashes. The anchor is the
    // coin itself (AttachParticle follows its center; the 1.01->2x flight
    // growth does NOT scale the beams).
    const rays = [ // [image, brightness, spinLo, spinHi, angleDeg, minActiveStops]
      ["rays2", 0.4, -41, -70, 270, [[0.02, 0], [0.02, 1], [0.21, 21]]],
      ["rays2", 0.3, -41, -70, 90, [[0.02, 0], [0.02, 1], [0.21, 21]]],
      ["rays1", 0.2, -41, -70, 180, [[0.02, 0], [0.02, 1], [0.21, 21]]],
      ["rays1", 0.1, -41, -70, 0, [[0.02, 0], [0.02, 1], [0.21, 21]]],
      ["rays2", 0.4, -30, -60, 270, [[0.01, 0], [0.01, 1], [0.2, 20]]],
      ["rays2", 0.3, -30, -60, 90, [[0.01, 0], [0.01, 1], [0.2, 20]]],
      ["rays1", 0.2, -30, -60, 180, [[0.01, 0], [0.01, 1], [0.2, 20]]],
      ["rays1", 0.1, -30, -60, 0, [[0.01, 0], [0.01, 1], [0.2, 20]]],
    ];
    for (const [img, bright, slo, shi, ang, target] of rays) {
      this.beams.push({
        kind: "ray", coin: c, img, bright, slo, shi,
        rot0: ang * Math.PI / 180, target, age: 0, parts: [],
      });
    }
    // AwardGlow: single white glow joining at 18% of the 1500-tick life,
    // scale .1 EaseIn to 25, additive.
    this.beams.push({ kind: "glow", coin: c, img: "glow", age: 0, part: null });
    // AwardFlash1-4: single expanding white flashes at system ages
    // 0/80/120/160 of their 200-tick emitters, scale 1->25 over 30/40 ticks,
    // alpha .6/.2 at 50% -> 0. Flash1 is additive at half brightness.
    const flashes = [
      { at: 0, dur: 30, alpha0: 0.6, blue: 0.5, additive: true, bright: 0.5 },
      { at: 80, dur: 40, alpha0: 0.2, blue: 0.8, additive: false, bright: 1 },
      { at: 120, dur: 40, alpha0: 0.2, blue: 0.8, additive: false, bright: 1 },
      { at: 160, dur: 40, alpha0: 0.2, blue: 0.8, additive: false, bright: 1 },
    ];
    for (const f of flashes) {
      this.beams.push({ kind: "flash", coin: c, img: "glow", age: 0, part: null, ...f });
    }
  }
  // Award-beam emitter tick (TodParticleEmitter::Update + UpdateSpawning).
  tickBeam(em) {
    if (!em.coin || em.coin.dead) return false;
    em.age++;
    if (em.kind === "ray") {
      if (em.age >= 1500) return false; // system life = ParticleDuration
      const f = em.age / 1500;
      const want = Math.floor(segVal(em.target, f));
      for (let i = em.parts.length; i < want; i++) {
        em.parts.push({
          rot: em.rot0, // ParticleSpinAngle constant per emitter (delta applies once)
          spd: (em.slo + Math.random() * (em.shi - em.slo)) * 0.01 * Math.PI / 180,
          age: 0,
        });
      }
      for (const p of em.parts) { p.rot += p.spd; p.age++; }
      return true;
    }
    if (em.kind === "glow") {
      if (em.age >= 1500) return false;
      // SpawnMinActive "0,18 1,18": the single glow joins at 18% of life.
      if (!em.part && em.age / 1500 >= 0.18) em.part = { age: 0 };
      if (em.part) em.part.age++;
      return true;
    }
    // flash: single shot at its system age, then the part plays out.
    if (em.age >= em.at && !em.part) em.part = { age: 0 };
    if (em.part) {
      em.part.age++;
      if (em.part.age >= em.dur) return false;
    }
    return em.age < 200;
  }
  // Board::ShowCoinBank (default 1000 ticks): pops the bottom-left money
  // UI the moment a money coin is clicked (Coin::MouseDown IsMoney).
  showCoinBank(dur = 1000) { this.coinBankT = dur; }
  // Board::FadeOutLevel (1858-1965): win jingle (StopAllMusic is main-side,
  // gated on fadeOut; WINMUSIC foley here — L50 fanfare out of scope), the
  // fade counter (600, 500 on x9 levels), mower-gold scheduling
  // (CanDropLoot-gated: silent on first-time 1-9), in-flight coins scored.
  fadeOutLevel() {
    this.sfx("win");
    this.fadeOut = this.level % 10 === 9 ? 500 : 600; // 1934-1938: 500 on the x9 note levels (black fade), 600 elsewhere
    if (this.canDropLoot()) this.scoreNextMower = 200;
    // TryAutoCollectAfterLevelAward (1945-1949): flying coins score now, the
    // rest vanish (the flying award coin scores at fade end instead).
    for (const k of this.coins) {
      if (k.collected && !k.isAward()) { k.dead = true; this.collectCoin(k); }
      else if (!k.collected) k.dead = true;
    }
  }
  // Board::UpdateLevelEndSequence (1779-1821): ticks the fade; mower gold
  // every 40 ticks from the bottom-most ready mower (first gold 200 after
  // fade start); fade end completes the level.
  updateLevelEnd() {
    // Vasebreaker intermission (Board::UpdateLevelEndSequence 1727-1760):
    // the 500-counter runs with NO fade (fadeOut stays -1) while play
    // continues; the normal fade path below is untouched.
    if (this.isVase) this.updateVaseIntermission();
    if (this.fadeOut < 0) return;
    // DrawFadeOut (7299-7313) hits full veil exactly at counter 0 — hold it
    // there through completeWin (fadeOut stays 0, never -1) so the board
    // never pops back before the award screen (which itself starts with a
    // full veil fading in: white-to-white, black-to-black on note levels,
    // like retail's KillBoard + fresh-veil AwardScreen handoff).
    if (--this.fadeOut <= 0) { this.fadeOut = 0; this.completeWin(); return; }
    // mBoardFadeOutCounter == 300 plays SOUND_LIGHTFILL (Board.cpp 1788-1794),
    // skipped on note levels 9/19/29/39/49 (black-veil fades; no survival in
    // scope, so no repick branch). Raw PlaySample — flat, no pitch.
    if (this.fadeOut === 300 && this.level % 10 !== 9) this.sfx("lightfill");
    if (this.scoreNextMower > 0) { if (--this.scoreNextMower > 0) return; }
    if (this.canDropLoot()) {
      this.scoreNextMower = 40;
      const ready = this.mowers.filter((m) => m && m.state === "ready");
      const bot = ready[ready.length - 1];
      if (bot) {
        // ScoreNextMower (Board.cpp 1808-1819): the gold spawns with
        // COIN_MOTION_LAWNMOWER_COIN, which self-collects at birth and
        // scores on arrival — never a clickable ground coin.
        this.addCoin(bot.x + 40, bot.y + 40, "gold", "mower");
        // Birth-Collect flows through the IsMoney branch (Coin::Collect
        // 1253-1256), so the bank pops here — not on bank arrival
        // (ScoreCoin 426-449 shows nothing). Each spawn refreshes the
        // 1000-tick display through the fade, like retail.
        this.showCoinBank();
        // Raw SOUND_POINTS pitched by the REMAINING untriggered count
        // (Board.cpp 1812-1818, semitones): clamp(6 - ready, 0, 6).
        this.sfx("points", 1, Math.max(0, Math.min(6, 6 - ready.length)));
        bot.state = "used"; bot.visible = false; // LawnMower::Die (instant, no run)
      }
    }
  }
  // Fade end (1785) + CompleteEndLevelSequenceForSaving (1825-1855):
  // untriggered mowers pay out their gold to the profile total, leftover
  // flying coins score, then the level is complete (profile via finishLevel).
  // Retail flips to the award screen as soon as mLevelComplete is set
  // (LawnApp::CheckForGameEnd: KillBoard + ShowAwardScreen, both behind the
  // full-white veil) — no dead beat on the unveiled board.
  // USER OVERRIDE: hold the full-veil board for a full second (100 ticks at
  // 100tps) before flipping, so the player sits on a completely veiled frame
  // (white — black on the note level) before the reward screen proper appears.
  completeWin() {
    if (this.canDropLoot()) {
      const ready = this.mowers.filter((m) => m && m.state === "ready").length;
      this.money += COIN_VAL.gold * ready;
    }
    for (const k of this.coins) { if (k.collected) this.collectCoin(k); k.dead = true; }
    this.beams = []; this.bursts = []; // pickup fx die with the board fade
    this.doomFx = []; // the 400-tick doom system would outlive the fade
    this.iceFx = []; // ice detonation/shard systems die with the fade too
    this.state = "won"; this.endCd = 100;
  }
  zombieReachedHouse(z) {
    // mower check, else lost
    // CheckForBoardEdge (4467): a headless zombie never takes the house —
    // it takes 1800 damage at the edge instead and drops on the spot.
    if (!z.hasHead) { z.damage(1800, this, 9); return; }
    if (this.state !== "play") return; // loss sequence: the winner walks through
    const m = this.mowers[z.row];
    if (m && m.state === "ready") { this.triggerMower(m); return; }
    if (this.state === "play") this.startZombiesWon(z);
  }
  // Board::ZombiesWon (Board.cpp) + Zombie::WalkIntoHouse (Zombie.cpp:534780)
  // + CutScene::Start/UpdateZombiesWon: the winning zombie keeps walking left
  // into the house while the camera pans right (board +220). At brain time the
  // splash plays, then the game-over dialog.
  startZombiesWon(z) {
    this.state = "lost";
    this.clearAdvice(null); // Board::ZombiesWon (5184/5232): ClearAdvice(ADVICE_NONE)
    this.tutorialArrow = -1; // TutorialArrowRemove (5235)
    this.sfx("lose"); // losemusic (StartZombiesWon stops music + plays it; updateMusic stops the tune on lost)
    // StartZombiesWon (CutScene.cpp:1496-1497): StopAllZombieSounds — a
    // popping jack's crank or a tunneling digger's song must not play on
    // through the walk-in. Headless-safe like the zombie song helpers.
    try { this.libs.stopLoop("jackinthebox"); } catch (e) { /* headless */ }
    try { this.libs.stopLoop("digger"); } catch (e) { /* headless */ }
    this.showShovel = false;
    this.winner = z || null;
    this.lossT = 0;
    this.brainShake = 0; // SetShakeOverride(ZombiesWon, 1.0/0.0) at 7000/8000cs
    this.brainsUp = false; // splash reanim built at 6000cs (main builds it)
    this.brainsEnd = false; // anim_screen pose at 11000cs (main poses it)
    if (z) {
      z.stopEating();
      z.body.reenableClipping(); // Zombie::WalkIntoHouse (Zombie.cpp:534780)
      // WalkIntoHouse first line (Zombie.cpp:9618): the winner's zamboni
      // smoke detaches (AttachmentDetachCrossFadeParticleType SMOKE) — the
      // airborne puffs finish but no new ones spawn. Tire dirt is
      // world-space, so it needs no detach.
      for (const em of this.zamFx) {
        if (em.follow === z && ZAM_SMOKE_DEFS.includes(em.def)) { delete em.follow; em.noSpawn = true; }
      }
      // houseWalk marks the WINNER (mFromWave = ZOMBIE_WAVE_WINNER): it blocks
      // the mower ready-trigger rescan + the BoardEdge loss retrigger + bot
      // targeting. It is NOT what stops eating — retail never runs
      // UpdatePlaying during SCENE_ZOMBIES_WON (Zombie.cpp:4239-4247 runs
      // UpdateZombieWalking directly), so the winner walks without chewing.
      z.houseWalk = true;
      // WalkIntoHouse pole gate (Zombie.cpp:9622-9626) runs BEFORE the
      // background branches, so it applies on roof too: a pre-vault pole
      // flips to POST and restarts its walk anim; every other winner keeps
      // its current cycle below.
      const poleFlipped = z.type === "pole" && z.phase === "prevault";
      if (poleFlipped) { z.phase = "post"; z.startWalkAnim(0); } // StartWalkAnim(0) (Zombie.cpp:9625)
      // Zombie::WalkIntoHouse roof branch (Zombie.cpp:9659-9684): the winner
      // teleports to the chimney mouth (-180, 250) at HEIGHT_IN_TO_CHIMNEY
      // (render order GRAVE_STONE 0,2 — behind the door mask like the
      // doorway winner) and idles (anim_idle LOOP @15) unless a polevaulter,
      // which keeps its walk cycle. Per-type nudges: garg +5y, football -14x,
      // zamboni -28x. UpdateZombieChimney (9607) then sinks it 200->0 over
      // cutscene 4000-5000cs (lossT 400-500); ZombieNotWalking holds it in
      // place meanwhile (UpdateZombieWalking no-ops on the chimney height).
      // Graphics: the chimney + mask are baked into background5.png /
      // background5_gameover_mask.png (both byte-identical from main.zip
      // images/ — no separate chimney art ships in main.zip).
      if (this.stageHasRoof()) {
        z.x = -180; z.y = 250;
        z.height = "chimney"; // HEIGHT_IN_TO_CHIMNEY
        z.altitude = 200;
        z.row = 2; // mask band (GRAVE_STONE 0,2 draws in the row-2 pass)
        if (z.type === "garg") z.y += 5;
        else if (z.type === "football") z.x -= 14;
        else if (z.type === "zamboni") z.x -= 28;
        if (!poleFlipped && z.type !== "pole") {
          try {
            if (z.body.trackExists("anim_idle")) z.playZombie("anim_idle", LOOP, 0, 15);
            else z.syncBody();
          } catch (e) { z.syncBody(); }
        } else z.syncBody();
        return;
      }
      z.row = 2; // WalkIntoHouse render row (MakeRenderOrder ZOMBIE,2,0)
      // WalkIntoHouse (Zombie.cpp:9631): mPosY = 290 flat — a screen-space
      // doorway constant, not lane-relative (stage lanes sit at 250 on pool
      // but the house door doesn't move). Roof winners took the chimney
      // branch above and returned already.
      z.y = 290;
      if (z.type === "garg") z.y += 30; // WalkIntoHouse garg branch
      else if (z.type === "zamboni") z.y += 15; // WalkIntoHouse zamboni branch
      // Zombie::WalkIntoHouse pool branch (Zombie.cpp:9647-9657): on pool
      // stages the winner shifts left as it enters — football -10,
      // everything else -80. This is the backyard walk-in.
      if (this.stageHasPool()) {
        if (z.type === "football") z.x -= 10;
        else z.x -= 80;
      }
      // NOTE: WalkIntoHouse's pole +35 line (Zombie.cpp:9638) is dead code in
      // the source — it tests PRE_VAULT after the lines above already flipped
      // the phase to POST — so retail winners get NO nudge and neither do we.
      // The pre-vault flip ran above (all backgrounds); other winners just
      // re-sync here to keep their current cycle.
      if (!poleFlipped) z.syncBody();
    }
  }
  triggerMower(m) {
    // LawnMower::MowZombie (386): the row's mow memory stamps the wave, so
    // PickRowForNewZombie avoids the cleared lane for a wave or two.
    this.waveRowMowed[m.row] = this.currentWave;
    // LawnMower::MowZombie + StartMower (LawnMower.cpp:124/367): first trigger
    // starts the engine (70fps lawn, 35 pool); further hits extend the chomp.
    if (m.state === "ready") {
      m.state = "run";
      if (m.body) m.body.animRate = m.pool ? 35 : 70; // StartMower (LawnMower 367)
      this.syncMowerBody(m); // pool/roof triggered offsets (-10,-7 / -10,+14)
      m.chomp = 25;
    } else {
      m.chomp = 50;
    }
    // MowZombie (LawnMower.cpp:140-157): pool cleaners SUCK the triggering
    // zombie (FOLEY_SHOOP + anim_suck in the water / anim_landsuck on land +
    // DieWithLoot) instead of flattening it; lawn mowers mow down.
    for (const z of this.zombies) {
      if (z.type === "boss") continue; // retail: mowers never touch the boss
      if (!z.dead && !z.mowed && !z.gone && z.row === m.row && z.hitX() < m.x + 50 && z.hitX() + z.hitW() > m.x) {
        if (m.pool) {
          this.sfx("shoop"); // FOLEY_SHOOP (LawnMower.cpp:142)
          if (m.body) {
            const suck = m.height === "in-pool" ? "anim_suck" : "anim_landsuck";
            if (m.body.trackExists(suck)) m.body.playReanim(suck, PLAY_ONCE_AND_HOLD, 10, 35);
          }
          z.dieWithLoot();
        } else z.mowDown();
        break;
      }
    }
    // StartMower foley (LawnMower.cpp:367): POOL_CLEANER on water, the
    // lawnmower loop on grass.
    this.sfx(m.pool ? "poolCleaner" : "mower");
  }
  // ----- per-tick -----
  update() {
    // Game-over / award dialog up (ended): the whole board freezes like a
    // pause — rain tiles (drawn off tick), storm machine, splash reanims and
    // all. Before the dialog (loss walk-in) everything above keeps ticking.
    if ((this.state === "won" || this.state === "lost") && this.ended) return;
    this.tick++; // mMainCounter runs even during intro/end states
    // Challenge::Update stormy head (2139-2140): the lightning machine runs
    // before everything else, in every scene the sim ticks in (play, won,
    // lost — the cutscene never calls update, and pause is driven by main).
    this.updateStorm();
    if (this.state === "won" || this.state === "lost") {
      if (this.state === "lost" && this.winner && !this.ended) {
        // Board::Update during SCENE_ZOMBIES_WON + CutScene::UpdateZombiesWon
        // (1502-1562). Ticks here are centiseconds/10 (mCutsceneTime += 10).
        // The board FREEZES at the sequence start: Plant::Update runs only on
        // SCENE_PLAYING (Plant.cpp:2880), Projectile::Update only on PLAYING
        // (Projectile.cpp:46E460), Coin::Update only on PLAYING/AWARD
        // (Coin.cpp:431500), LawnMower::Update only on PLAYING (LawnMower.cpp
        // gate), SeedPacket::Update only on PLAYING (SeedPacket.cpp:487250) —
        // and Board::UpdateGame returns before spawning/sun/ice/progress
        // (Board.cpp:5797). So nothing simulates except the WINNER zombie
        // (Zombie::Update doUpdate gate, 4212) which walks only once
        // ShowZombieWalking (lossT>150, CutScene 2382) via UpdateZombieWalking
        // — never UpdatePlaying, so the winner never eats during the walk-in.
        // EffectSystem + Advice still tick via Board::Update (5878-5879).
        this.lossT++;
        // The WINNER alone ticks (4212 doUpdate gate); the frozen horde keeps
        // its frames. Mowers are frozen too (PLAYING gate), so no MowZombie
        // can catch the winner mid-walk.
        if (!this.winner.gone) this.winner.updateLossWalk(this.lossT);
        // Chomps (1511-1514: BrainStart-400/-900), splash + scream (1517-1527:
        // built at -BOARD_OFFSET @12fps PLAY_ONCE_AND_HOLD, fullscreen track
        // black, SetFramesForLayer("ZombiesWon"); the SCREAM plays too),
        // shake (1531-1539), screen pose + dialog end (1541-1562).
        if (this.lossT === 510 || this.lossT === 560) this.sfx("chomp");
        if (this.lossT === 600 && !this.brainsUp) { this.brainsUp = true; this.sfx("scream"); }
        if (this.lossT === 700) this.brainShake = 1;
        if (this.lossT === 800) this.brainShake = 0;
        // User-directed deviation: the splash HOLDS its completed final frame
        // as its own beat before the dialog (ended at 1400, not the source
        // 11000cs). The source BrainGraphicEnd pose (1541) is folded into the
        // same tick: SetFramesForLayer resets the clock, which would REPLAY
        // the strip instead of holding it — and both ranges share frame 52
        // identically, so holding frame 52 to 1400 shows the same pixels.
        if (this.lossT >= 1400) { this.brainsEnd = true; this.ended = true; }
        this.updateFx();
        this.updateAdvice(); // Board::Update (5879): widget ticks in end states
        return;
      }
      if (--this.endCd <= 0) this.ended = true;
      this.updateFx();
      this.updateAdvice();
      return;
    }
    if (this.state === "intro") {
      if (--this.introT <= 0) this.state = "play";
      this.updateFx();
      this.updateAdvice();
      return;
    }
    // recharge: refresh completion fires SeedPacket::FlashIfReady (158) —
    // sparkle + REFRESH->PICK_UP, both gated on CanPickUp inside.
    for (const k of Object.keys(this.recharge)) {
      if (this.recharge[k] > 0 && --this.recharge[k] === 0) this.flashIfReady(+k);
    }
    if (this.outOfMoney > 0) this.outOfMoney--; // Board::Update 5886-5888
    for (const k of Object.keys(this.packetFlash)) if (--this.packetFlash[k] <= 0) delete this.packetFlash[k];
    // sky sun (Board::UpdateSunSpawning, Board.cpp:5311): the FIRST early-out
    // is HasLevelAwardDropped (5314) — nothing falls once the award drops.
    // UpdateSunSpawning (5330): no sky sun during L1 pick-up/plant with an empty lawn.
    const noSkySun = (this.tutorialState === TUT.L1_PICK_UP_PEASHOOTER || this.tutorialState === TUT.L1_PLANT_PEASHOOTER) && this.allPlants().length === 0;
    // UpdateSunSpawning early-outs (5315-5327): night, dropped award,
    // conveyor banks, and the L1 empty-lawn tutorial gate all skip sky sun.
    // Bowling lives off the belt.
    if (!this.stageIsNight() && !noSkySun && !this.isConveyor && !this.hasLevelAwardDropped()) {
      if (--this.sunCd <= 0) {
        this.sunCd = Math.min(SUN_SKY_MAX, SUN_SKY_GAP0 + this.sunFallen * 10 | 0) + Math.floor(Math.random() * SUN_SKY_RANGE);
        this.sunFallen = (this.sunFallen | 0) + 1;
        this.coins.push(new Coin(this, "sun", 130 + Math.floor(Math.random() * 550), 60, "sky"));
        // Board::AddCoin (2013): first sky sun on first-time L1 prompts pickup.
        if (this.firstTime && this.level === 1) {
          this.displayAdvice(ADVICE_TEXT.CLICK_ON_SUN, "L1stay", "CLICK_ON_SUN");
        }
      }
    }
    // Conveyor belt ticks during play (Challenge::Update 2160-2163).
    if (this.state === "play") this.convUpdate();
    // Rain splash spawner (Challenge::Update 2152-2155): play only, and never
    // while paused (the pause gate at 2142-2150 returns first).
    if (this.state === "play" && !this.paused) this.updateRain();
    // Seed-bank slide (Challenge::Update 2172-2182): the cutscene bank stays
    // hidden (IsChallengeWithoutSeedBank gate) and slides in +2/tick once sun
    // exists. The gate covers whack AND scary (adventure vase never earns sun,
    // so its bank stays hidden like retail). Other boards draw at rest.
    if ((this.isWhack || this.isVase) && this.bankY < 0 && this.sun > 0) {
      this.bankY = Math.min(0, this.bankY + 2);
    }
    this.updateSpawning();
    this.updateIce();
    // Vasebreaker: swing the hammer while it runs (Challenge::ScaryPotterUpdate
    // 4130-4150). Pots populate in the ctor (Challenge ctor 387-390), not here.
    if (this.isVase && this.state === "play") {
      this.updateMallet();
      // A cursor-held usable coin that somehow died (save edge, stale link)
      // must not jam the cursor: drop the link so pickup works again.
      if (this.heldUsable && this.heldUsable.dead) this.heldUsable = null;
      // Completion re-check (ScaryPotterIsCompleted): opening the last vase
      // while zombies live does not complete — killing the last zombie with
      // zero vases left does (checked here every tick, like the per-frame
      // Challenge::Update gate). The award drops at the last broken vase.
      if (this.vaseStarted && !this.levelAwardSpawned && !this.nextSurvivalStage && this.vaseCompleted()) {
        this.checkVaseCompleted(this.vaseLastC, this.vaseLastR);
      }
    }
    // Board::UpdateGame fog path (Board.cpp:5780-5795 + 5817-5820): the
    // offset easing is the pre-gate half (runs in every scene, so the
    // cutscene drives it via updateFogIntro instead), and the blow countdown
    // ticks in the post-gate half (play only).
    this.updateFogOffset(false);
    if (this.fogBlown > 0) this.fogBlown--;
    // Board::Update (5804-5815): the freeze-all counter ticks down after the
    // trail update; at 0 the pool sparkle resumes (Board 5807-5814 — no
    // poolSparkly system ships in this port, so the expiry branch is a
    // documented no-op).
    if (this.iceTrapCounter > 0) this.iceTrapCounter--;
    this.updateGridItems(); // Board::UpdateGridItems (Board.cpp:9675)
    // Board::UpdateGame (5822): first play tick of a first-time run opens
    // the tutorial (L1 pick-up-peashooter, L2 pick-up-sunflower).
    if (this.tick === 1 && this.firstTime && !this.isIntro) {
      if (this.level === 1) this.setTutorialState(TUT.L1_PICK_UP_PEASHOOTER);
      else if (this.level === 2) {
        this.setTutorialState(TUT.L2_PICK_UP_SUNFLOWER);
        this.displayAdvice(ADVICE_TEXT.PLANT_SUNFLOWER1, "L2");
        this.tutorialTimer = 500;
      }
    }
    this.updateProgressMeter();
    // Board::Update tail (5878-5880): the advice widget (incl. the HUGE_WAVE
    // letter drivers) ticks after UpdateGame, then the tutorial.
    this.updateAdvice();
    this.updateTutorial();
    // plants
    for (const c of this.cells) for (const k of ["lily", "pot", "base", "shell", "flying"]) {
      const p = c[k];
      if (p && !p.dead) p.update();
      if (p && p.dead) c[k] = null;
    }
    // bowling rollers (Plant::UpdateAbilities 2568-2572: UpdateBowling runs
    // INSTEAD of the normal ability branch on bowling levels).
    for (const bw of this.bowlers) if (!bw.dead) bw.update();
    this.bowlers = this.bowlers.filter((bw) => !bw.dead);
    // zombies
    for (const z of this.zombies) if (!z.gone && !z.held) z.update();
    this.zombies = this.zombies.filter((z) => !z.gone);
    // projectiles
    this.updateProjs();
    this.updateLobs();
    // coins
    for (const c of this.coins) c.update();
    this.coins = this.coins.filter((c) => !c.dead);
    // mowers
    for (const m of this.mowers) this.updateMower(m);
    this.updateFog(); // Board::UpdateFog (Board.cpp:7482): every scene incl. intro (the cutscene calls it via updateFogIntro)
    this.updateFx();
    // Win sequence: the award coin (dropped by the last kill via
    // TrySpawnLevelAward) starts the fade when collected; the fade ticks
    // here (UpdateLevelEndSequence 1779) and completes the level at 0.
    // (GAMEMODE_INTRO demo boards never fade: fadeOut stays -1.)
    if (this.state === "play") this.updateLevelEnd();
  }
  updateFx() {
    if (this.shake > 0) this.shake--;
    this.tickPoolFx(); // water counter + sparkles (gated inside: pool/fog, no ice, not lost)
    this.flashes = this.flashes.filter((f) => --f.t > 0);
    // Potato-mine blast (PARTICLE_POTATO_MINE spudow strip mote): static
    // anchor, animT advances at AnimationRate*0.01 like RenderParticle.
    for (const s of this.potatoBlasts) {
      if (s.animRate) { s.animT += s.animRate; if (s.animT >= 1) s.animT -= 1; }
      s.age++;
    }
    this.potatoBlasts = this.potatoBlasts.filter((e) => e.age < e.dur);
    // Fume-shroom spray (PARTICLE_FUMECLOUD strip mote): static anchor,
    // animT advances at AnimationRate*0.01 (2.0 -> 0.02) like RenderParticle.
    for (const s of this.fumeClouds) {
      if (s.animRate) { s.animT += s.animRate; if (s.animT >= 1) s.animT -= 1; }
      s.age++;
    }
    this.fumeClouds = this.fumeClouds.filter((e) => e.age < e.dur);
    // Whack hammer POW bursts (PARTICLE_POW at RENDER_LAYER_ABOVE_UI,
    // Challenge::MouseDownWhackAZombie 1222): single 50-tick mote, alpha
    // holds to 90% then fades (SystemAlpha 1,90 0,100). Ticked here,
    // rendered in the TOP pass above the UI.
    for (const p of this.pows) p.age++;
    this.pows = this.pows.filter((p) => p.age < p.dur);
    // Vasebreaker break fx: the brown/green 27-frame strips play through once
    // (~30 ticks, alpha fade at the tail); the zombie chunk systems tick here.
    for (const s of this.vaseStrips) s.age++;
    this.vaseStrips = this.vaseStrips.filter((s) => s.age < s.dur);
    for (const em of this.vaseChunks) { em.age++; this.tickVaseChunks(em); }
    this.vaseChunks = this.vaseChunks.filter((em) => em.age < em.dur);
    for (const d of this.dirt) {
      d.vy += 0.12; d.x += d.vx; d.y += d.vy;
      if (d.y > d.y0 + 8) { d.y = d.y0 + 8; d.vy = 0; d.vx *= 0.8; }
      d.life--;
    }
    this.dirt = this.dirt.filter((d) => d.life > 0);
    // Squash landing dust (PARTICLE_DUST_SQUASH): billow out/up, expand,
    // fade — same TodParticleEmitter shape as the dirt above (fields ->
    // pos, no floor clamp: the puffs drift). Swept on expiry.
    for (const d of this.squashDust) {
      d.x += d.vx; d.y += d.vy; d.vy -= 0.02; d.s += 0.02;
      d.life--;
    }
    this.squashDust = this.squashDust.filter((d) => d.life > 0);
    for (const s of this.splats) {
      // TodParticleEmitter::UpdateParticle: fields, then position += velocity.
      const t = s.age / (s.dur - 1);
      if (t > s.dragAt) { s.vx *= 1 - s.drag; s.vy *= 1 - s.drag; } // FIELD_FRICTION
      s.vy += s.grav; // FIELD_ACCELERATION
      s.dx += s.vx; s.dy += s.vy;
      // FIELD_POSITION (muzzle drift, trail +20 X): the track delta applies
      // straight to the position, outside friction.
      if (s.fx) { s.dx += s.fx; s.dy += s.fy; }
      // PeaSplat AnimationRate 2.5: animT += rate*0.01, wraps at 1.0.
      if (s.animRate) { s.animT += s.animRate; if (s.animT >= 1) s.animT -= 1; }
      s.age++;
    }
    // Trail motes die with their projectile (ParticleSystemDie kills the
    // attached system incl. its motes), like zombie-attached splats do.
    this.splats = this.splats.filter((s) => s.age < s.dur && !(s.z && s.z.gone) && !(s.p && s.p.dead));
    // Award pickup fx (Coin::Collect 1214/1232): STARBURST burst motes fly
    // out with friction + gravity; the attached Award.xml emitters ride the
    // award coin (tickBeam returns false when spent or orphaned).
    for (const p of this.bursts) {
      p.vx *= 0.95; p.vy *= 0.95; // FIELD_FRICTION 0.05
      p.vy += p.grav ?? 0.005; // FIELD_ACCELERATION Y: 0.5 starburst, 5.0 present-pickup (x0.01)
      p.x += p.vx; p.y += p.vy;
      const t = Math.min(1, (p.age / (p.dur - 1)) / 0.8);
      p.rot += p.v0 + (p.v1 - p.v0) * t; // spin settles by 80% of life
      p.age++;
    }
    this.bursts = this.bursts.filter((p) => p.age < p.dur);
    for (const em of this.beams) em.ok = this.tickBeam(em);
    this.beams = this.beams.filter((em) => em.ok);
    // Cherry/explode-o-nut blast (PARTICLE_POWIE): 3 emitters ticked like
    // TodParticleEmitter::Update; spent systems sweep with their motes.
    for (const em of this.powies) em.ok = this.tickPowie(em);
    this.powies = this.powies.filter((em) => em.ok);
    // Ice-shroom fx (PARTICLE_ICE_TRAP + PARTICLE_ICE_TRAP_RELEASE):
    // emitters ticked like TodParticleEmitter::Update (fields -> pos ->
    // spin -> age, DeleteNonCrossFading sweep); rendered in the TOP pass.
    for (const em of this.iceFx) em.ok = this.tickIceFx(em);
    this.iceFx = this.iceFx.filter((em) => em.ok);
    // Doom-shroom blast (PARTICLE_DOOM): 11 emitters ticked like
    // TodParticleEmitter::Update; spent systems sweep with their motes.
    for (const em of this.doomFx) em.ok = this.tickDoomFx(em);
    this.doomFx = this.doomFx.filter((em) => em.ok);
    // Zamboni systems (SMOKE/TIRE/EXPLOSION + ice sparkles): same
    // TodParticleEmitter::Update shape (fields -> pos -> spin -> age;
    // rate/minActive/maxLaunched spawning; sweep on death, SYSTEM_LOOPS
    // restart); rendered in the TOP pass (sparkles at GROUND row+3).
    for (const em of this.zamFx) em.ok = this.tickZamFx(em);
    this.zamFx = this.zamFx.filter((em) => {
      if (!em.ok) {
        for (let r = 0; r < this.rows; r++) if (this.iceSpark[r] === em) this.iceSpark[r] = null;
      }
      return em.ok;
    });
    // Pool splash reanims (PoolSplash above): PLAY_ONCE to natural death
    // (~141 ticks), ticked inline and swept on mDead like the retail holder.
    for (const sp of this.splashes) sp.reanim.update();
    this.splashes = this.splashes.filter((sp) => !sp.reanim.dead);
    // Storm splash reanims (Challenge::UpdateRain): PLAY_ONCE to natural
    // death, ticked inline and swept on mDead like the pool splashes above.
    for (const rf of this.rainFx) rf.reanim.update();
    this.rainFx = this.rainFx.filter((rf) => !rf.reanim.dead);
    for (const tb of this.tallnutBlocks) {
      tb.age++;
      for (const m of tb.motes) { m.x += m.vx; m.y += m.vy; m.rot += m.spinVel; m.age++; }
      tb.motes = tb.motes.filter((m) => m.age < m.dur);
    }
    this.tallnutBlocks = this.tallnutBlocks.filter((tb) => tb.age < tb.dur);
    // Ambient pool sparkles (PARTICLE_POOL_SPARKLY, Board 5922/5807) tick in
    // tickPoolFx above (spawn + drift + scale pulse + sweep, called from
    // this updateFx on every sim tick); the old white-dot stand-in is gone.
    for (const em of this.graveFx) em.ok = this.tickGraveFx(em);
    this.graveFx = this.graveFx.filter((em) => em.ok);
    this.tickDiggerFx(); // digger tunnel/rise/dirt systems (row-banded, transient)
    for (const em of this.wallnutEats) em.ok = this.tickWallnutEat(em);
    this.wallnutEats = this.wallnutEats.filter((em) => em.ok);
    if (this.flagT > 0) this.flagT--;
    // Board::Update: the coin-bank UI fades out over its last 15 ticks
    // (DrawUICoinBank alpha) and dies at 0 (no purchase dialog in scope).
    if (this.coinBankT > 0) this.coinBankT--;
    for (const d of this.debris) d.update();
    this.debris = this.debris.filter((d) => !d.dead);
    // Charred husks (ApplyBurn 8740): AddReanimation-birthed reanims tick with
    // the board; PLAY_ONCE ends them (mDead) and the holder sweeps them here.
    for (const h of this.husks) h.body.update();
    this.husks = this.husks.filter((h) => !h.body.dead);
    // Mower-kill puffs (MowDown 8563-8564): same tick + sweep-on-dead holder
    // shape as the charred husks above.
    for (const p of this.puffs) p.body.update();
    this.puffs = this.puffs.filter((p) => !p.body.dead);
    // Jalapeno fire trail (Board::DoFwoosh/UpdateFwoosh): the shared
    // countdown flips flames to their done anim; every flame reanim ticks
    // with the board and the finished ones sweep here.
    this.updateFwoosh();
    for (const f of this.fwoosh) f.body.update();
    this.fwoosh = this.fwoosh.filter((f) => !f.body.dead);
    // Fire-pea impact flames (see spawnFireBurst): one-shot PLAY_ONCE bursts,
    // ticked with the board and swept when done.
    for (const f of this.fireFx) f.body.update();
    this.fireFx = this.fireFx.filter((f) => !f.body.dead);
  }
  updateSpawning() {
    if (this.isIntro) return; // GAMEMODE_INTRO demo: staged zombies only, no waves
    // Vasebreaker: no wave spawner at all (numWaves 0; zombies come from vases).
    if (this.isVase) return;
    // Challenge::UpdateZombieSpawning whack branch (2921-2925): the whack
    // state machine runs instead of the normal spawner.
    if (this.isWhack) { this.whackSpawning(); return; }
    if (this.finalSfxCd > 0 && --this.finalSfxCd === 0) this.sfx("finalwave");
    if (this.state !== "play") return;
    // UpdateZombieSpawning (5385): nothing spawns during the L1 pick-up /
    // plant / refresh tutorial states (COMPLETED releases wave 1 at cd 99).
    if (this.tutorialState === TUT.L1_PICK_UP_PEASHOOTER ||
        this.tutorialState === TUT.L1_PLANT_PEASHOOTER ||
        this.tutorialState === TUT.L1_REFRESH_PEASHOOTER) return;
    // Board::UpdateZombieSpawning (5391): nothing spawns once the award drops.
    // (Redundant in practice — the award needs currentWave >= numWaves, which
    // already exits below — but source-exact, and it pins the rise/huge ticks
    // above the wave-gate like retail.)
    if (this.hasLevelAwardDropped()) return;
    // Board::UpdateZombieSpawning (5394): the grave/sky/pool rise ticks down
    // ahead of the wave-gate below, so the final wave's 200-tick rise fires
    // even though no more waves remain.
    if (this.riseCounter > 0) {
      if (--this.riseCounter === 0) this.spawnFromGraves();
    }
    if (this.hugeCd > 0) {
      // Board::UpdateZombieSpawning (5403-5439): at 0 clear the HUGE advice
      // (keyed — only clears if still current), fire NextWaveComing and cut
      // the countdown to 1. At 725 the huge-wave sfx plays and the source
      // falls through (no return), so zombieCd ticks 5 -> 4 that tick and
      // holds; otherwise the countdown holds the wave (return). Music-burst
      // stingers at 400/700 need adaptive music, which we don't have — out
      // of scope.
      if (--this.hugeCd === 0) { this.clearAdvice("HUGE_WAVE"); this.waveComing(); this.zombieCd = 1; }
      else if (this.hugeCd === 725) this.sfx("hugewave");
      else return;
    }
    if (this.currentWave >= this.numWaves) return;
    this.zombieCd--;
    if (this.zombieCd > 200 && this.zombieCdStart - this.zombieCd > 400) {
      const total = this.waveHealth(this.currentWave - 1);
      if (total <= this.healthToNext) this.zombieCd = 200;
    }
    if (this.zombieCd === 5) {
      if (this.isFlagWave(this.currentWave)) {
        // Board::UpdateZombieSpawning (5479-5482): ClearAdviceImmediately,
        // then DisplayAdviceAgain("[ADVICE_HUGE_WAVE]", HUGE_WAVE) — the
        // Again form resets the shown-flag so every flag wave re-announces —
        // and hold the wave for the 750-tick announcement.
        const A = ADVICE_TEXT;
        this.clearAdvice(null);
        delete this.helpShown["HUGE_WAVE"];
        this.displayAdvice(A.HUGE_WAVE, "HUGE", "HUGE_WAVE");
        this.hugeCd = 750; return;
      }
      this.waveComing();
    }
    if (this.zombieCd === 0) { // UpdateZombieSpawning (5491): exact-zero spawn
      this.spawnWave();
      this.waveHealthStart = this.waveHealth(this.currentWave - 1);
      // Wall-nut bowling (adventure 5) flag waves use the normal branch.
      // Post-increment currentWave is the NEXT wave here (SpawnZombieWave
      // already advanced it, Board.cpp:5079) — the 4500-tick buildup gates the
      // wave ABOUT to count down when it is a flag wave (Board.cpp:5496), not
      // the wave just spawned. Checking currentWave-1 put the long wait AFTER
      // flag waves and rushed every flag (incl. the bobsled/zamboni flags)
      // in ~2000 ticks early.
      if (this.isFlagWave(this.currentWave) && this.level !== 5) {
        this.healthToNext = 0; // mZombieHealthToNextWave
        this.zombieCd = WAVE_PRE_FLAG; // ZOMBIE_COUNTDOWN_BEFORE_FLAG
      } else {
        this.healthToNext = (0.5 + Math.random() * 0.15) * this.waveHealthStart;
        // Little Trouble (adventure 25) holds waves a flat 750.
        this.zombieCd = this.level === 25 ? 750 : WAVE_GAP + Math.floor(Math.random() * WAVE_GAP_RANGE);
      }
      this.zombieCdStart = this.zombieCd;
    }
  }
  // Board::UpdateIce (Board.cpp:5518): ice sheets tick down each play tick;
  // at 0 the edge resets to BOARD_ICE_START (800) and the row's sparkle
  // system dies (ParticleSystemDie). While the sheet runs, the row keeps a
  // PARTICLE_ICE_SPARKLE system whose center rides the leading edge
  // (SystemMove to (mIceMinX, GridToPixelY(8,row))) at GROUND row+3, with its
  // alpha overridden to timer/10 (UpdateIce 5550). The system itself ticks
  // in updateFx with the other zam systems; UpdateIce only moves it.
  updateIce() {
    for (let r = 0; r < this.rows; r++) {
      if (this.iceTimer[r] > 0) {
        if (--this.iceTimer[r] === 0) {
          this.iceMinX[r] = 800;
          const sys = this.iceSpark[r];
          if (sys) {
            const i = this.zamFx.indexOf(sys);
            if (i >= 0) this.zamFx.splice(i, 1);
            this.iceSpark[r] = null;
          }
        } else {
          let sys = this.iceSpark[r];
          if (!sys || this.zamFx.indexOf(sys) < 0) {
            this.spawnZamFx(ZAM_SPARKLE_DEFS, this.iceMinX[r], gridToPixelY(8, r, this.bg));
            sys = this.zamFx[this.zamFx.length - 1];
            sys.spark = true;
            this.iceSpark[r] = sys;
          } else {
            sys.cx = this.iceMinX[r]; sys.cy = gridToPixelY(8, r, this.bg);
          }
          sys.alphaMul = Math.max(0, Math.min(255, this.iceTimer[r] / 10)) / 255;
        }
      }
    }
  }
  graveRisingType() {
    // Board::PickGraveRisingZombieType (Board.cpp:2442): weighted normal /
    // cone (+pail when the stage has no gravestones — tombstone-less night
    // boards). First-time levels below a type's start zero it; disallowed
    // types zero too EXCEPT normal (the != NORMAL carve-out, 2432). Zeroed
    // entries stay in the weighted roll (TodPickFromWeightedArray skips
    // zero-weight entries), falling back to normal when all are zero.
    const cands = [{ t: "normal", w: ROSTER.normal.pick }, { t: "cone", w: ROSTER.cone.pick }];
    if (!this.hasGraves()) cands.push({ t: "bucket", w: ROSTER.bucket.pick });
    for (const c of cands) {
      if (this.firstTime && this.level < ROSTER[c.t].start) c.w = 0;
      else if (c.t !== "normal" && !zombieAllowedOnLevel(c.t, this.level)) c.w = 0;
    }
    const ok = cands.filter((c) => c.w > 0);
    if (!ok.length) return "normal";
    return todPickWeighted(ok, Math.random);
  }
  queueGraveRise(col, row, type, wave, fast = false, maxSpeed = 0) {
    // Board::SpawnZombiesFromGraves (Board.cpp:4962) / whack spawning: the
    // ZombieRise fx + the rising zombie spawn on the SAME tick
    // (Zombie::RiseFromGrave 8141/8200) — dirt bursts as the buried body
    // arrives; no staging delay.
    const z = this.spawnZombie(type, row, wave);
    if (!z) return;
    z.riseFromGrave(col, row);
    if (fast) {
      z.riseT = 50; // whack risers pop fast
      const sp = maxSpeed > 0 ? maxSpeed : 1;
      z.velX = 0.5 + Math.random() * Math.max(0.01, sp - 0.5);
      z.updateAnimSpeed();
    }
  }
  spawnFromGraves() {
    // Board::SpawnZombiesFromGraves (Board.cpp:4962): roof drops from the
    // sky, pool rises from the water, else one zombie per RIPE gravestone
    // (mGridItemCounter >= 100 — still-rising stones spawn nothing) placed
    // AT its grid via RiseFromGrave, spending zombie-value points from a
    // GetGraveStonesCount() budget (floored at 1). War-and-peas returns
    // early (out of scope); roof/pool only matter on their own bgs.
    // ripeness-gated with points budget (same-tick fx + body per RiseFromGrave).
   if (this.bg === BG.ROOF || this.bg === BG.BOSS) {
      // Board::SpawnZombiesFromSky (4919): frozen boards hold the drops
      // (ice-trap gate); count 2 on 41/42 else 3 — the points budgets
      // (3/5/7) never gate the loop, so only the count ports. Cells come
      // off the SetupBungeeDrop grid (cols 4-8, all rows) with no
      // replacement (TodPickFromWeightedGridArray zeroes the picked weight).
     const lv = this.level;
      if ((this.iceTrapCounter | 0) > 0) return;
     const count = (lv === 41 || lv === 42) ? 2 : 3;
      const cells = [];
      for (let gx = 4; gx < 9; gx++) for (let gy = 0; gy <= 4; gy++) cells.push([gx, gy]);
      for (let i = 0; i < count && cells.length; i++) {
        const [gx, gy] = cells.splice(Math.floor(Math.random() * cells.length), 1)[0];
        this.bungeeDropZombie(this.graveRisingType(), gx, gy);
     }
     return;
   }
    if (this.stageHasPool()) {
      // Board::SpawnZombiesFromPool (Board.cpp:4826): 2 risers on
      // 21/22/31/32, else 3 — planted AT distinct pool cells (cols 5-8,
      // rows 2-3, weight-zeroed once picked) via RiseFromGrave, which
      // surfaces them from the water (seaweed + splash, no dirt/rumble).
      const lv = this.level;
      const count = (lv === 21 || lv === 22 || lv === 31 || lv === 32) ? 2 : 3;
      const cells = [];
      for (let gx = 5; gx < 9; gx++) for (let gy = 2; gy <= 3; gy++) cells.push([gx, gy]);
      for (let i = 0; i < count && cells.length; i++) {
        const [gx, gy] = cells.splice(Math.floor(Math.random() * cells.length), 1)[0];
        const z = this.spawnZombie(this.graveRisingType(), gy, this.currentWave);
        if (!z) continue;
        z.riseFromGrave(gx, gy); // pool branch: x=grid-25, surfacing rise
      }
      return;
    }
    let points = this.cells.filter((c) => c.grave).length; // GetGraveStonesCount
    this.cells.forEach((cell, i) => {
      if (!cell.grave || cell.grave.counter < 100) return; // unripe: skip
      const col = Math.floor(i / this.rows), row = i % this.rows;
      const type = this.graveRisingType();
      this.queueGraveRise(col, row, type, this.currentWave);
      points -= ROSTER[type].value;
      if (points < 1) points = 1;
    });
  }
  hasGraves() { return this.cells.some((c) => c.grave); }
  // Challenge::WhackAZombieSpawning (Challenge.cpp:2792-2916): the whack
  // state machine runs INSTEAD of the normal wave spawner (hooked at the
  // top of updateSpawning). zombieCd ticks every play tick; at 100 with
  // waves underway it tops graves back toward 5; at 5 NextWaveComing; at 0
  // it resets to 2000, advances the wave, and arms the batch counter (300
  // on the final wave, else 1). Below 300 ticks the batch counter ticks;
  // at 0 it spawns one batch (phase from (wave-1)*6/12 clamped 0-5, double/
  // triple/pail/cone tables, final wave 20 cone/pail at maxSpeed 2) from
  // non-gravebuster graves via RiseFromGrave (phase 50, velX 0.5..maxSpeed),
  // then re-arms with the TodAnimateCurve wave-scaled window (100->30 /
  // 200->60 LINEAR); the final batch zeroes both counters.
  whackSpawning() {
    if (this.currentWave === this.numWaves && this.zombieCd === 0) return;
    this.zombieCd--;
    if (this.zombieCd === 100 && this.currentWave > 0) {
      const have = this.cells.filter((c) => c.grave).length;
      this.whackPlaceGraves(Math.max(1, 5 - have));
    }
    if (this.zombieCd === 5) this.waveComing();
    if (this.zombieCd === 0) {
      this.zombieCd = 2000; this.zombieCdStart = 2000;
      this.currentWave++;
      this.challengeCounter = this.currentWave === this.numWaves ? 300 : 1;
    } else if (this.zombieCd < 300) {
      return;
    }
    if (--this.challengeCounter === 0) {
      const wave = this.currentWave;
      const phase = Math.max(0, Math.min(5, Math.floor((wave - 1) * 6 / 12)));
      const dbl = [0, 30, 10, 10, 15, 18][phase];
      const tpl = [0, 0, 0, 0, 10, 13][phase];
      const pailC = [0, 0, 0, 10, 15, 15][phase];
      const coneC = [0, 0, 30, 30, 30, 30][phase];
      const isFinal = wave === this.numWaves;
      let count = 1;
      const numHit = Math.floor(Math.random() * 100);
      if (isFinal) count = 20;
      else if (numHit < tpl) count = 3;
      else if (numHit < tpl + dbl) count = 2;
      let type = "normal";
      const typeHit = Math.floor(Math.random() * 100);
      if (typeHit < pailC && count < 3) type = "bucket";
      else if (typeHit < pailC + coneC) type = "cone";
      // Grave picks: non-gravebuster graves only, weight 1, zeroed per pick.
      const picks = [];
      for (const cell of this.cells) {
        if (!cell.grave) continue;
        const top = this.topPlant(cell.col, cell.row);
        if (top && top.seed === 11) continue;
        picks.push({ cell, w: 1 });
      }
      const easeIn = (t0, t1, t, v0, v1) => {
        if (t <= t0) return v0; if (t >= t1) return v1;
        let k = (t - t0) / (t1 - t0); k = 1 - Math.pow(1 - k, 2); return v0 + (v1 - v0) * k;
      };
      let maxSpeed = easeIn(1, 12, wave, 1, 3);
      if (count > picks.length) count = picks.length;
      for (let i = 0; i < count; i++) {
        let total = 0; for (const p of picks) total += p.w;
        if (total <= 0) break;
        let roll = Math.random() * total, sel = null;
        for (const p of picks) { roll -= p.w; if (roll <= 0) { sel = p; break; } }
        if (!sel) sel = picks.find((p) => p.w > 0);
        if (!sel) break;
        sel.w = 0;
        let zt = type, sp = maxSpeed;
        if (isFinal) {
          zt = Math.floor(Math.random() * 2) === 0 ? "cone" : "bucket";
          sp = 2;
        }
        // RiseFromGrave through the same path (whack pops fast: riseT 50).
        this.queueGraveRise(sel.cell.col, sel.cell.row, zt, this.currentWave, true, sp);
      }
      const lo = 1 + (100 - 30) * (wave - 1) / 11;
      const hi = 1 + (200 - 60) * (wave - 1) / 11;
      // TodAnimateCurve LINEAR 1->12 maps wave 1..12 to 100->30 / 200->60.
      const mn = Math.round(100 + (30 - 100) * Math.min(1, Math.max(0, (wave - 1) / 11)));
      const mx = Math.round(200 + (60 - 200) * Math.min(1, Math.max(0, (wave - 1) / 11)));
      void lo; void hi;
      this.challengeCounter = mn + Math.floor(Math.random() * (mx - mn + 1));
      if (isFinal) { this.zombieCd = 0; this.challengeCounter = 0; }
    }
  }
  // ----- Vasebreaker (Challenge::ScaryPotter*, Challenge.cpp) -----
  // Vase pixel pos (GridItem::DrawScaryPot 298: grid-5, gridY-15).
  vasePos(c, r) { return { x: gridToPixelX(c, this.bg) - 5, y: gridToPixelY(c, r, this.bg) - 15 }; }
  // Challenge::ScaryPotterPopulate (3903-3948, adventure L35 branch): weighted
  // pick per content with the weight zeroed per placed pot (TodPickFrom-
  // WeightedArray over weight-1 cells = uniform pick here, so items and cells
  // both draw uniform-without-replacement), then LEAF-mark N seed pots
  // (stages 1-2). Every pot starts QUESTION (PlacePot 3838) — adventure never
  // marks ZOMBIE (that state is puzzle-garg-only, ChangePotType 3863-3864);
  // zombie-content pots burst brown like everything unmarked (OpenPot 4274).
  vasePopulate(stage) {
    const excl = stage === 0 ? 6 : stage === 1 ? 5 : 4; // excluded cols 0..excl-1
    const cells = [];
    for (let c = excl; c < 9; c++) for (let r = 0; r < 5; r++) cells.push({ c, r });
    const S = (s) => ({ k: "seed", s }), Z = (t) => ({ k: "zombie", t });
    const table = stage === 0
      ? [S(0), S(0), S(0), S(0), S(0), S(17), S(17), S(17), S(17), S(17), Z("normal"), Z("normal"), Z("normal"), Z("normal"), Z("bucket")]
      : stage === 1
        ? [S(0), S(0), S(0), S(0), S(5), S(5), S(5), S(5), S(5), S(17), S(17), S(17), S(17), Z("normal"), Z("normal"), Z("normal"), Z("normal"), Z("normal"), Z("bucket"), Z("football")]
        : [S(0), S(0), S(0), S(0), S(0), S(5), S(5), S(5), S(5), S(5), S(12), S(12), S(12), S(12), S(12), Z("normal"), Z("normal"), Z("normal"), Z("normal"), Z("normal"), Z("normal"), Z("bucket"), Z("bucket"), Z("dancer"), Z("jack")];
    const items = table.slice();
    while (items.length && cells.length) {
      const ii = Math.floor(Math.random() * items.length);
      const ci = Math.floor(Math.random() * cells.length);
      const content = items.splice(ii, 1)[0];
      const { c, r } = cells.splice(ci, 1)[0];
      this.vases.push({ col: c, row: r, content, state: "question", transparent: 0 });
    }
    // LEAF-mark N seed pots on stages 1-2 (ChangePotType 3853-3883, which only
    // ever considers SCARYPOT_SEED pots for LEAF).
    if (stage > 0) {
      const seeds = this.vases.filter((v) => v.content.k === "seed");
      const n = stage === 1 ? 2 : 3;
      for (let i = 0; i < n && seeds.length; i++) {
        seeds.splice(Math.floor(Math.random() * seeds.length), 1)[0].state = "leaf";
      }
    }
  }
  // Challenge::ScaryPotterMalletPot (4153-4163): hammer reanim at the vase
  // GRID origin (GridToPixel, RENDER_LAYER_TOP) playing REANIM_HAMMER
  // anim_pot_open at 40fps + FOLEY_SWING (pitch range 2). ScaryPotterUpdate
  // (4130-4150) opens on loop end — 8 frames at rate 40 = 20 ticks.
  vaseMalletAt(col, row) {
    if (!this.isVase || this.mallet || this.state !== "play") return false;
    if (this.isVaseDaveTalking()) return false;
    const v = this.vases.find((o) => o.col === col && o.row === row);
    if (!v) return false;
    let body = null;
    try {
      body = this.makeReanim("Hammer", gridToPixelX(col, this.bg), gridToPixelY(col, row, this.bg));
      body.playReanim("anim_open_pot", PLAY_ONCE_AND_HOLD, 0, 40);
    } catch (e) { body = null; }
    this.mallet = { c: col, r: row, t: 0, body };
    this.sfx("swing"); // FOLEY_SWING
    return true;
  }
  updateMallet() {
    const m = this.mallet;
    if (!m) return;
    if (m.body) { try { m.body.update(); } catch (e) { m.body = null; } }
    m.t++;
    // Challenge::ScaryPotterUpdate (4130-4150): the pot opens when the
    // hammer anim ENDS (loop end), never on a fixed tick count. (The old
    // hardcoded 43-tick counter outlived the 8-frame @40fps anim_open_pot
    // — 20 ticks — leaving the hammer parked ~230ms before the pop.)
    // No-def/headless fallback opens at the true 20-tick anim length; the
    // 120-tick cap is a backstop against a corrupt def softlocking play.
    if (m.body ? (m.body.loopCount <= 0 && m.t < 120) : m.t < 20) return;
    const v = this.vases.find((o) => o.col === m.c && o.row === m.r);
    this.mallet = null;
    if (v) this.openVase(v);
  }
  // Challenge::ScaryPotterOpenPot (4227-4278): SEED → usable-seed coin at
  // (gridX+20, gridY); ZOMBIE → AddZombieInRow(type,row,0) at the vase grid
  // origin; SUN n/a in adventure. GridItemDie, help swap, then stage
  // completion. SOUND_BONK is a raw PlaySample (flat — explicit pitch 0, NOT
  // the foley table's range 2); FOLEY_VASE_BREAKING rolls pitch -5.
  // Break fx key on the pot STATE (4273-4276): LEAF → green strip, everything
  // else (adventure pots are QUESTION or LEAF — never ZOMBIE) → brown strip.
  openVase(v) {
    const i = this.vases.indexOf(v);
    if (i < 0) return;
    this.vases.splice(i, 1);
    const gx = gridToPixelX(v.col, this.bg), gy = gridToPixelY(v.col, v.row, this.bg);
    const cx = gx + 20;
    this.vaseLastC = v.col; this.vaseLastR = v.row;
    // Content first (OpenPot 4231-4253): SEED → usable packet, ZOMBIE →
    // AddZombieInRow(type,row,0) at the vase grid origin, then GridItemDie,
    // the help swap, and the completion branch (which plays FOLEY_SPAWN_SUN
    // inside SpawnLevelAward) — and only then BONK + VASE_BREAKING (4271-4272).
    if (v.content.k === "seed") {
      const c = new Coin(this, "usable", cx, gy, "plant");
      c.seed = v.content.s;
      this.coins.push(c);
    } else {
      // AddZombieInRow(type,row,0) with mPosX at the vase grid origin (4237).
      const z = this.spawnZombie(v.content.t, v.row, this.currentWave);
      if (z) z.x = gx;
    }
    this.vaseStrips.push({ img: v.state === "leaf" ? "green" : "brown", x: cx, y: gy, age: 0, dur: 30 });
    // Help swap (OpenPot 4255: mHelpIndex == ADVICE_USE_SHOVEL_ON_POTS —
    // the CURRENT advice, not the was-ever-shown map).
    if (this.helpIndex === "USE_SHOVEL_ON_POTS") {
      this.displayAdvice(ADVICE_TEXT.DESTROY_POTS, "HINT_FAST", "DESTROY_POTS");
    }
    this.checkVaseCompleted(v.col, v.row);
    this.sfx("bonk", 1, 0);
    this.sfx("vaseBreaking");
  }
  // Vase-shatter zombie chunks (IMAGE_VASE_CHUNKS 288x96, cols=9 rows=3 =
  // 32x32 cells; zombie row = purple row 2, cels 18-26). Exact raw XML:
  // 16 motes, Box [-10 40]x[0 70], LaunchSpeed [40 80] (x0.01, random
  // direction), dur 100, scale [.8 .9], gravity field Y=7.0 (0.07/tick),
  // ground constraint Y [65 78] (past 50%: reflect 0), CollisionSpin 0 +
  // RandomLaunchSpin, spinSpeed [-1120 1120] -> 0 at 50%, alpha 1,90 0.
  // NOTE: adventure L35 never triggers this — OpenPot keys the fx on the pot
  // STATE (QUESTION → brown strip; ZOMBIE state is puzzle-garg-only). Kept as
  // the exact compiled-XML model for any future puzzle-mode use.
  spawnVaseChunks(x, y) {
    const motes = [];
    for (let i = 0; i < 16; i++) {
      const sp = (40 + Math.random() * 40) * 0.01;
      const a = Math.random() * Math.PI * 2;
      motes.push({
        x: x - 10 + Math.random() * 50, y: y + Math.random() * 70,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        sc: 0.8 + Math.random() * 0.1,
        spin: (-1120 + Math.random() * 2240) * 0.01,
        cel: 18 + Math.floor(Math.random() * 9),
        floor: y + 65 + Math.random() * 13,
      });
    }
    this.vaseChunks.push({ x, y, age: 0, dur: 100, motes });
  }
  tickVaseChunks(em) {
    const t = em.dur <= 1 ? 1 : Math.min(1, em.age / (em.dur - 1));
    for (const m of em.motes) {
      m.vy += 0.07; // gravity field Y 7.0
      m.x += m.vx; m.y += m.vy;
      // spinSpeed -> 0 at 50%: linear decay over the first half.
      m.spin *= t < 0.5 ? 0.96 : 0;
      if (m.y >= m.floor) {
        m.y = m.floor;
        // CollisionReflect .4 (40 -> 0 by 50%), CollisionSpin 0.
        if (t < 0.5) { m.vy = -m.vy * 0.4; m.vx *= 0.4; }
        else { m.vy = 0; m.vx = 0; }
        m.spin = 0;
      }
    }
  }
  // Challenge::ScaryPotterJackExplode (4281-4294): a jack blast opens pots
  // in 1-cell range. Iterates a copy — openVase spawns zombies mid-loop.
  vaseJackExplode(cx, cy) {
    if (!this.isVase) return;
    const g = pixelToGrid(cx, cy, this.bg);
    for (const v of this.vases.slice()) {
      if (Math.abs(v.col - g.col) <= 1 && Math.abs(v.row - g.row) <= 1) this.openVase(v);
    }
  }
  // Challenge::ScaryPotterIsCompleted: no pots and no enemies on screen.
  vaseCompleted() {
    if (this.vases.length) return false;
    return !this.zombies.some((z) => z.hasHead && !z.dead && !z.gone && !z.ally && !z.mowed && z.burnT <= 0);
  }
  // OpenPot completion branch (4259-4268): GRID coords in (the award math adds
  // its own +40). Non-final → silent FadeOutLevel (counter 500, advice
  // cleared); final (survivalStage==2) → SpawnLevelAward.
  checkVaseCompleted(gc, gr) {
    if (!this.vaseCompleted() || this.levelAwardSpawned || this.nextSurvivalStage > 0) return;
    // IsFinalScaryPotterStage (adventure): survivalStage == 2.
    if (this.survivalStage >= 2) this.spawnVaseAward(gc, gr);
    else {
      // PuzzlePhaseComplete → FadeOutLevel (silent, ClearAdvice,
      // nextSurvivalStageCounter = 500). Silent: no win sfx here (the next
      // stage's StartLevel brings the tune); clear the advice immediately.
      this.clearAdvice(null);
      this.nextSurvivalStage = 500;
    }
  }
  // Challenge::SpawnLevelAward (2252-2284) for the final stage:
  // COIN_FINAL_SEED_PACKET at GridToPixel+40,+40, BOARDRESULT_WON (won on
  // collect), FOLEY_SPAWN_SUN (SOUND_THROW, pitch range 10), screen-CENTER
  // flash, all live zombies TakeDamage(1800).
  // (Replay money-bag branch (2259-2261) is out of scope port-wide: every
  // replay award in this port is the seed, like the normal TrySpawnLevelAward
  // path — see collectAward/trySpawnLevelAward comments.)
  spawnVaseAward(gc, gr) {
    this.levelAwardSpawned = true;
    const c = new Coin(this, "award-seed", gridToPixelX(gc, this.bg) + 40, gridToPixelY(gc, gr, this.bg) + 40, "coin");
    c.seed = awardSeedForLevel(this.level);
    this.coins.push(c);
    this.sfx("throw"); // FOLEY_SPAWN_SUN (pitch range 10)
    this.flashAt(400, 300, 600); // PARTICLE_SCREEN_FLASH at screen center (same stand-in radius as the intermission flash)
    for (const o of this.zombies) if (!o.dead && !o.gone) { try { o.takeDamage(1800, 0); } catch (e) { /* ignore */ } }
  }
  // Challenge::PuzzleNextStageClear (intermission at counter 300): wipe
  // zombies (DieNoLoot) / plants / usable coins, RefreshSeedPacketFromCursor
  // (the held usable coin dies silently — main clears its cursor on the cue),
  // survivalStage++, ClearAdviceImmediately, award un-spawned, SOUND_HUGE_WAVE,
  // screen flash, progress meter 0.
  puzzleNextStageClear() {
    for (const z of this.zombies) if (!z.dead && !z.gone) { try { z.dieNoLoot(); } catch (e) { z.dead = true; z.gone = true; } }
    for (const c of this.cells) {
      for (const k of ["lily", "pot", "base", "shell", "flying"]) {
        const p = c[k];
        if (p && !p.dead) p.dead = true;
        c[k] = null;
      }
      c.crater = 0;
    }
    // PuzzleNextStageClear coin sweep (4324-4337): usable coins die; everything
    // else auto-collects (TryAutoCollectAfterLevelAward — money/sun fly in).
    for (const k of this.coins) {
      if (k.dead || k.collected) continue;
      if (k.kind === "usable") k.dead = true;
      else if ((k.isSun && k.isSun()) || (k.isMoney && k.isMoney())) k.collected = true;
    }
    // PuzzleNextStageClear grid-item wipe (Challenge.cpp:4338-4344): every
    // grid item dies — the garden rake included — so the 2702/2801
    // intermission places a fresh rake (PlaceRake, +1 purchase consumed)
    // instead of keeping the old one.
    if (this.rake) {
      if (this.rake.body) { try { this.rake.body.dead = true; } catch (e) { /* ignore */ } }
      this.rake = null;
    }
    if (this.heldUsable) { this.heldUsable.dead = true; this.heldUsable = null; }
    this.clearAdvice(null);
    this.survivalStage++;
    this.levelAwardSpawned = false;
    this.sfx("hugewave");
    this.flashAt(400, 300, 600);
    this.progressW = 0;
  }
  // Challenge::IsScaryPotterDaveTalking (7577): scary && counter running &&
  // Dave up (daveActive is set by main.js each tick before update).
  isVaseDaveTalking() { return !!(this.isVase && this.nextSurvivalStage > 0 && this.daveActive); }
  // Board::UpdateLevelEndSequence vase branch (1727-1760) + FadeOutLevel
  // (1858-1910): the 500-counter ticks while Dave is NOT talking; at 300
  // (adventure) Dave enters + talks 2700/2800, the board clears and the
  // counter resets to 100; at 0 play resumes (Dave still talks until clicked
  // through). The sim raises vaseDaveCue at 300 — main.js owns Dave, so it
  // consumes the cue (daveEnter + daveTalkIndex) and reports daveActive.
  updateVaseIntermission() {
    if (!this.isVase || this.nextSurvivalStage <= 0) return;
    if (!this.isVaseDaveTalking()) this.nextSurvivalStage--;
    if (this.nextSurvivalStage === 300) {
      this.vaseDaveCue = this.survivalStage;
      this.puzzleNextStageClear();
      this.nextSurvivalStage = 100;
    } else if (this.nextSurvivalStage <= 0) {
      this.nextSurvivalStage = 0;
    }
  }
  // Usable-seed cursor (Coin::Collect 1240-1251 + RefreshSeedPacketFromCursor
  // 2051-2056 / DroppedUsableSeed 1369-1379): the picked-up coin rides the
  // cursor (held, not collected); planting kills it with no sun cost;
  // cancelling drops it back as a resting coin. DroppedUsableSeed caps the
  // fade clock at 1200 on the FIRST cancel only (later cancels keep the
  // running clock) — a cancelled seed never gets a fresh 1500.
  pickUpUsable(c) {
    if (!c || c.dead || c.kind !== "usable" || this.heldUsable) return false;
    c.held = true;
    // Coin::Collect usable branch (1240-1251): the packet freezes where it
    // rests (groundY = mPosY) and any in-progress fade is cancelled.
    c.groundY = c.y;
    c.fadeCount = 0; c.alpha = 1;
    this.heldUsable = c;
    this.sfx("seedlift"); // Coin::PlayCollectSound SEEDLIFT branch (1329-1332)
    return true;
  }
  dropHeldUsable() {
    const c = this.heldUsable;
    if (!c) return;
    c.held = false;
    if (!c.timesDropped) c.disappear = Math.min(c.disappear, 1200);
    c.timesDropped = (c.timesDropped | 0) + 1;
    this.heldUsable = null;
  }
  plantHeldUsable(col, row) {
    const c = this.heldUsable;
    if (!c || c.dead) { this.heldUsable = null; return false; }
    if (this.plantAt(col, row, c.seed, -1, true)) {
      c.dead = true;
      this.heldUsable = null;
      return true;
    }
    return false;
  }
  // Board::UpdateProgressMeter (Board.cpp:414270, simplified): health-fraction
  // of the active wave maps to a 0..150 target; the meter only creeps upward
  // (fast when far behind, slow near the target). Flag waves pop flagRaise.
  updateProgressMeter() {
    if (this.state !== "play" || this.currentWave === 0) return;
    if (this.flagRaise > 0) this.flagRaise--;
    const ai = Math.min(this.currentWave - 1, this.numWaves - 1);
    let frac = 1;
    if (this.waveHealthStart > 0) {
      let rem = 0;
      for (const z of this.zombies) {
        if (!z.dead && !z.gone && z.wave === ai) rem += z.hp + (z.helm | 0) + (z.shield | 0) + (z.paper | 0);
      }
      frac = Math.min(1, Math.max(0, 1 - rem / this.waveHealthStart));
    }
    const target = Math.min(150, Math.max(1, Math.round(150 * (ai + frac) / this.numWaves)));
    const delta = target - this.progressW;
    const seg = 150 / this.numWaves;
    if ((delta > seg && this.tick % 5 === 0) || (delta > 0 && this.tick % 20 === 0)) this.progressW++;
  }
  // Board::NextWaveComing (5349-5368): the final wave raises the FinalWave
  // banner (REANIM_FINAL_WAVE at (0,30), SOUND_FINALWAVE 60 ticks later);
  // the first wave plays AWOOGA, flag waves SIREN, regular waves nothing.
  waveComing() {
    if (this.currentWave === 0) this.sfx("awooga");
    // Whack-a-Zombie siren gate (Board.cpp:5364): whack has no flag waves —
    // the siren fires only when the upcoming wave is the last one.
    else if (this.isWhack ? this.currentWave === this.numWaves - 1 : this.isFlagWave(this.currentWave)) this.sfx("siren");
    if (this.currentWave + 1 === this.numWaves) { this.finalWave = 120; this.finalSfxCd = 60; }
  }
  // Board::TotalZombiesHealthInWave (Board.cpp:5024): live wave members only
  // (no mindcontrolled, dying, bungee, or related/follower zombies); body +
  // helm + shield*0.2 (+flying, which has no separate pool in this port —
  // balloon HP rides in body). Newspaper is a shield type, hence the *0.2.
  waveHealth(w) {
    let h = 0;
    for (const z of this.zombies) {
      if (z.dead || z.gone || z.ally || z.wave !== w) continue;
      if (z.type === "bungee" || z.parent || z.related) continue; // related: dance followers + bobsled sleds ride the parent's wave budget (5016)
      h += z.hp + (z.helm | 0) + ((z.shield | 0) + (z.paper | 0)) * 0.2;
    }
    return h;
  }
  updateProjs() {
    // Plant::UpdateTorchwood runs every tick (all torchwoods convert
    // overlapping peas/snow), then Projectile::UpdateNormalMotion per shot:
    // straight +3.33, backwards -3.33, star drifts + re-lanes, threepeater
    // side peas drift row-fixed (MOTION_THREEPEATER never updates mRow),
    // puff +3.33 with the 75-tick life (CheckForCollision 246), then
    // FindCollisionTarget -> DoImpact. Live puff spores also feed their
    // attached trail emitter (Projectile.cpp:109-113) while still flying.
    this.updateTorchwood();
    for (const p of this.projs) {
      if (p.dead) continue;
      p.age++;
      if (p.motion === "puff" && p.age >= 75) { p.dead = true; continue; } // MOTION_PUFF life
      if (p.motion === "back") p.x -= PEA_SPEED;
      else if (p.motion === "star") {
        // MOTION_STAR (Projectile.cpp:665-678): pos and shadow ride velXY;
        // the row re-lanes off the Y only on diagonal flight (672-678).
        // Rotation integrates every tick (Update 957).
        p.x += p.velX; p.y += p.velY;
        p.shadowY += p.velY;
        p.rot += p.rotSpeed;
        if (p.velY !== 0) p.row = this.rowFromY(p.x, p.y);
      } else if (p.motion === "three") {
        // MOTION_THREEPEATER (Projectile.cpp:692-698): the pea keeps its
        // spawn row for collision (only HOMING/STAR update mRow) while the
        // shadow tracks the post-decay velY (mShadowY += mVelY AFTER the
        // *0.97 decay — line order 694-697).
        p.x += PEA_SPEED; p.y += p.velY; p.velY *= 0.97;
        p.shadowY = (p.shadowY || 0) + p.velY;
      } else p.x += PEA_SPEED;
      if (p.x > BOARD_W || p.x + 40 < 0) { p.dead = true; continue; } // offscreen
      // Star bounds (CheckForCollision 274): die above the top / below lawn.
      if (p.type === "star" && (p.y > 600 || p.y < 40)) { p.dead = true; continue; }
      // Pea/star shadow-height gate (CheckForCollision 280): shots riding
      // high over the lawn (roof) skip collision this tick. SOURCE-EXACT:
      // only PROJECTILE_PEA and PROJECTILE_STAR are gated — snow and
      // fireballs skip it. Diagonal stars and threepeater side peas carry
      // their source shadows (star tracks velY per tick; threepeater the
      // target-row ground ∓80); everything else derives it from the row.
      if (p.type === "pea" || p.type === "star") {
        const sh = p.shadowY ? p.shadowY : gridToPixelY(8, p.row, this.bg) + 67;
        if (sh - p.y > 90) continue;
      }
      const z = this.findCollisionTarget(p);
      if (z) { this.projImpact(p, z); p.dead = true; }
      // Attached trail (Projectile.cpp:109-113): the system only emits
      // while its projectile lives — the dead shot feeds nothing, and its
      // old motes are swept with it in updateFx (ParticleSystemDie). Gated
      // on the PUFF type, not the motion: ProjectileInitialize attaches
      // PUFFSHROOM_TRAIL for every PROJECTILE_PUFF, and scaredy spores
      // (MOTION_STRAIGHT per Fire 4703) keep their trails at full range.
      if (!p.dead && p.type === "puff") this.puffTrail(p);
      // ConvertToFireball's REANIM_FIRE_PEA attachment (AttachmentUpdateAndMove
      // 962: the reanim rides (mPosX, mPosY + mPosZ) plus the attach offset).
      // AttachmentDie on projectile death sweeps it.
      if (p.fx) {
        if (p.dead) p.fx.dead = true;
        else {
          p.fx.x = p.x + (p.motion === "back" ? 55 : -25);
          p.fx.y = p.y - 25;
          p.fx.update();
        }
      }
    }
    this.projs = this.projs.filter((p) => !p.dead);
  }
  updateLobs() {
    // Projectile::UpdateLobMotion (Projectile.cpp:497): gravity arc
    // (velZ += accZ), descending-only collision past the per-type floor
    // (butter -32, melon -35, cabbage/kernel -30, +40 in pool), ground at
    // mPosZ > 80. Rising shots and high shots never collide. The spin ticks
    // in Update (Projectile.cpp:46E460, mRotation += mRotationSpeed) and the
    // roof slope rides in UpdateMotion (742-757: mPosY/mPosZ/shadowY).
    for (const l of this.lobs) {
      if (l.dead) continue;
      const oldX = l.x;
      l.age++;
      l.velZ += l.accZ;
      l.x += l.velX;
      l.z += l.velZ;
      l.rot += l.rotSpeed; // Update (46E460)
      // UpdateMotion slope ride (742-757): on the roof the ground follows
      // the slope and the height compensates, keeping the screen arc
      // continuous (no-op off-roof where GetPosYBasedOnRow is flat).
      const slope = posYOnRow(this.bg, l.x, l.row) - posYOnRow(this.bg, oldX, l.row);
      if (slope) { l.sy += slope; l.z -= slope; l.shadowY += slope; }
      l.y = l.sy + l.z; // screen Y (UpdateMotion 759-760)
      let minZ = -30;
      if (l.type === "butter") minZ = -32;
      else if (l.type === "melon") minZ = -35;
      if (this.isWaterRow(l.row)) minZ += 40; // pool rows ride higher (552-555)
      if (l.age > 20) {
        if (l.velZ < 0) continue; // still rising
        if (l.z <= minZ) continue; // not descended yet
      }
      const probe = { type: l.type, row: l.row, x: l.x, y: l.y, z: l.z, age: l.age, velX: 0, rangeFlags: l.rangeFlags, motion: "lobbed" };
      const z = this.findCollisionTarget(probe);
      const hitGround = l.z > 80;
      if (!z && !hitGround) continue;
      if (l.type === "melon") {
        // Melons always splash (even on bare ground): direct victim takes
        // full damage, ±1-row neighbors take the capped third.
        this.sfx("splat");
        this.doSplashDamage({ type: "melon", dmg: l.dmg, row: l.row, x: l.x, y: l.y, z: l.z, rangeFlags: l.rangeFlags, motion: "lobbed", velX: 0 }, z);
      } else if (z) {
        if (l.type === "cabbage") this.cabbageHit(z, l);
        else {
          if (l.type === "butter") { z.takeDamage(l.dmg, DMG_BYPASS); z.applyButter(); }
          else z.takeDamage(l.dmg, DMG_BYPASS); // kernel bypasses the shield
          this.sfx("splat");
        }
      } else {
        // DoImpact(null) (Projectile.cpp:880-884 + 898-923): a cabbage that
        // lands on bare ground still fires its world-attached splat
        // (aSplatPosX/Y straight into the world) under the FOLEY_SPLAT.
        if (l.type === "cabbage") this.cabbageSplat(l, null);
        this.sfx("splat");
      }
      l.dead = true;
    }
    this.lobs = this.lobs.filter((l) => !l.dead);
  }
  // Projectile::DoImpact cabbage path (Projectile.cpp:791-807 + 880-884):
  // cabbages take no kernel/butter/melon branch, so the helm sounds play
  // (pail SHIELD_HIT, cone/digger/football PLASTIC_HIT) under a random
  // FOLEY_SPLAT pick, the victim takes 40 bypass damage, and the
  // PARTICLE_CABBAGE_SPLAT system fires (attached at +52/clamped, or into
  // the world on a ground hit).
  cabbageHit(z, l) {
    if (z.type === "bucket" && z.helm > 0) this.sfx(Math.random() < 0.5 ? "shieldhit" : "shieldhit2");
    else {
      if (z.helm > 0 && (z.type === "cone" || z.type === "football" || z.type === "digger"))
        this.sfx(Math.random() < 0.5 ? "plastichit" : "plastichit2");
      this.sfx(["splat", "splat2", "splat3"][Math.floor(Math.random() * 3)]);
    }
    z.takeDamage(l.dmg, DMG_BYPASS);
    this.cabbageSplat(l, z);
  }
  // LawnMowerInitialize art (LawnMower.cpp:10-66): pool cleaners ride
  // REANIM_POOL_CLEANER at 0.8 on anim_land, everything else 0.85 (roof
  // cleaners ride REANIM_ROOF_CLEANER; the source poses no explicit layer
  // for roof, so anim_normal falls back to anim_idle like before). Idle
  // shows the frozen reanim (rate 0) like DrawCachedMower; the live cycle
  // only runs once triggered (StartMower: 70 lawn / 35 pool).
  initMowerBody(m) {
    if (!m || m.body) return;
    try {
      const name = m.roof ? "RoofCleaner" : (m.pool ? "PoolCleaner" : "LawnMower");
      m.body = this.makeReanim(name, m.x + 6, m.y + 18);
      const sc = name === "PoolCleaner" ? 0.8 : 0.85;
      m.body.setScale(sc, sc);
      const layer = m.pool ? "anim_land" : "anim_normal";
      m.body.playReanim(m.body.trackExists(layer) ? layer : "anim_idle", LOOP, 0, m.body.def.fps);
      m.body.animRate = 0; // frozen still until StartMower (rate 70/35)
      this.syncMowerBody(m);
    } catch (e) { m.body = null; }
  }
  // LawnMower::Draw art offsets (LawnMower.cpp:304-335): the reanim base
  // (0,18) folds into these — lawn rides (mPosX+6, mPosY-alt+18); pool ready
  // (mPosX+6, mPosY-alt-15), triggered (mPosX-4, mPosY-alt+11); roof ready
  // (mPosX+6, mPosY-alt-22), triggered (mPosX-4, mPosY-alt+14).
  syncMowerBody(m) {
    if (!m || !m.body) return;
    const trig = m.state !== "ready";
    if (m.pool) { m.body.x = m.x + 6 + (trig ? -10 : 0); m.body.y = m.y - (m.alt | 0) + (trig ? 11 : -15); }
    else if (m.roof) { m.body.x = m.x + 6 + (trig ? -10 : 0); m.body.y = m.y - (m.alt | 0) + (trig ? 14 : -22); }
    else { m.body.x = m.x + 6; m.body.y = m.y - (m.alt | 0) + 18; }
  }
  // LawnMower::UpdatePool (LawnMower.cpp:68): the cleaner dips into the water
  // (splash + ZOMBIESPLASH at 26 < x < 660) and climbs back out past it
  // (splash + PLANT_WATER), riding mAltitude 0 -> -28 in the pool.
  updateMowerPool(m) {
    let inRange = false;
    if (m.x > 26 && m.x < 660) inRange = true;
    if (inRange && m.height === "land") {
      // LawnMower::UpdatePool: reanim at (mPosX,mPosY+25) with the particle at
      // (mPosX+50,mPosY+42) (reanim+50,+17 — the generic +37,+42 would sit
      // 13px left and 25px deep).
      this.poolSplash(m.x + 0, m.y + 25, 1.2, 0.8, 50, 17);
      this.sfx("zombiesplash"); // FOLEY_ZOMBIESPLASH (UpdatePool: land->pool)
      m.height = "down";
    } else if (m.height === "down") {
      m.alt -= 2;
      if (m.alt <= -28) {
        m.alt = 0; m.height = "in-pool";
        if (m.body && m.body.trackExists("anim_water")) m.body.playReanim("anim_water", LOOP, 0, 0);
      }
    } else if (m.height === "in-pool") {
      if (!inRange) {
        m.alt = -28; m.height = "up";
        this.poolSplash(m.x + 0, m.y + 25, 1.2, 0.8, 50, 17);
        this.sfx("plantWater"); // FOLEY_PLANT_WATER (UpdatePool: pool->land)
        if (m.body && m.body.trackExists("anim_land")) m.body.playReanim("anim_land", LOOP, 0, 0);
      }
    } else if (m.height === "up") {
      m.alt += 2;
      if (m.alt >= 0) { m.alt = 0; m.height = "land"; }
    }
    // The suck one-shot hands back to the swim loop on completion (UpdatePool).
    if (m.height === "in-pool" && m.body && m.body.loopType === PLAY_ONCE_AND_HOLD && m.body.loopCount > 0) {
      if (m.body.trackExists("anim_water")) m.body.playReanim("anim_water", LOOP, 10, 35);
    }
  }
  updateMower(m) {
    if (!m) return;
    if (m.pool) this.updateMowerPool(m);
    // Art rides at the retail Draw offset (LawnMower.cpp:304), less the pool
    // altitude while the cleaner swims.
    if (m.body) m.body.update();
    this.syncMowerBody(m);
    if (m.state === "ready") {
      // LawnMower::Update trigger (LawnMower.cpp:189): X-overlap of the
      // (mPosX,50)-wide attack rect with the zombie rect + EffectedByDamage
      // 127U (203) — which excludes mind-controlled allies (8037), the whole
      // port-explicit `z.ally` skip below. A ready mower ignores bungees (and
      // headless zombies — the zombieReachedHouse edge handles those);
      // a running one does not. Retail skips the boss entirely.
      for (const z of this.zombies) {
        if (z.dead || z.gone || z.mowed || z.row !== m.row || z.type === "boss" || z.ally) continue; // LawnMower 189-210: tunneling diggers (bit6 UNDERGROUND in 127U) DO trigger — no digging skip
        if (z.houseWalk) continue; // loss sequence: the winner walks through, gameplay frozen
        if (!z.hp || z.hp <= 0) continue;
        if (m.state === "ready" && (z.type === "bungee" || !z.hasHead)) continue; // LawnMower 210: ready needs headed non-bungee
        const xov = Math.min(m.x + 50, z.hitX() + z.hitW()) - Math.max(m.x, z.hitX());
        if (Math.min(xov, 80) > (z.type === "balloon" ? 20 : 0)) { this.triggerMower(m); break; }
      }
      return;
    }
    if (m.state !== "run") return;
    // Running speed (LawnMower.cpp:223): 3.33 lawn, 2.5 pool, eased toward 1
    // while chomping (TodCurves::CURVE_BOUNCE_SLOW_MIDDLE approximated).
    let sp = m.pool ? 2.5 : MOWER_SPEED;
    if (m.chomp > 0) {
      m.chomp--;
      const k = m.chomp / 50;
      sp = 1.0 + (sp - 1.0) * (1 - Math.pow(1 - k, 3));
    }
    m.x += sp;
    // Rest height follows the user's nudged idle (+15, not source +23), so
    // the mower drives from exactly where it parked — no trigger pop.
    m.y = posYOnRow(this.bg, m.x + 40, m.row) + 15;
    // Re-sync art after the move (the top-of-tick sync predates it by one
    // step, i.e. a ~3px lag while running).
    this.syncMowerBody(m);
    for (const z of this.zombies) {
      if (z.dead || z.gone || z.mowed || z.row !== m.row || z.type === "boss" || z.ally) continue; // LawnMower 189-210: tunneling diggers DO trigger — no digging skip
      // GetLawnMowerAttackRect (mPosX,50 wide) vs zombie rect, X-overlap only
      // (Board::GetRectOverlap 9178) with the balloon >20 rule (LawnMower 207).
      const xov = Math.min(m.x + 50, z.hitX() + z.hitW()) - Math.max(m.x, z.hitX());
      if (Math.min(xov, 80) > (z.type === "balloon" ? 20 : 0)) {
        m.chomp = 50; // MowZombie while already triggered: extend the chomp
        if (m.pool) {
          this.sfx("shoop");
          if (m.body) {
            const suck = m.height === "in-pool" ? "anim_suck" : "anim_landsuck";
            if (m.body.trackExists(suck)) m.body.playReanim(suck, PLAY_ONCE_AND_HOLD, 10, 35);
          }
          z.dieWithLoot();
        } else z.mowDown(); // flip + drops; vehicles explode, big ones puff out
      }
    }
    // LawnMower::Update lawn-on-pool (LawnMower.cpp:240-248): a lawn mower
    // that reaches the pool (x>50) splashes and dies — only pool cleaners swim.
    if (!m.pool && !m.roof && this.isWaterRow(m.row) && m.x > 50) {
      this.poolSplash(m.x, m.y + 25, 1.2, 0.8, 50, 42);
      this.sfx("enteringWater"); // SOUND_ZOMBIE_ENTERING_WATER, raw sample
      m.state = "used"; // LawnMower::Die (bonus-mower chain N/A in scope)
      return;
    }
    if (m.x > BOARD_W) { m.state = "used"; }
  }
}
