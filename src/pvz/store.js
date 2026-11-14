// Crazy Dave's shop data (StoreScreen.cpp/h, GameConstants.h, ConstEnums.h).
// Source: gStoreItemSpots[4][8] page table (StoreScreen.cpp:35-44),
// GetItemCost (StoreScreen.cpp:GetItemCost), IsPageShown (StoreScreen.cpp:
// IsPageShown), IsComingSoon / IsItemSoldOut / IsItemUnavailable
// (StoreScreen.cpp), STORESCREEN_* layout (GameConstants.h),
// StoreItem / StorePages (ConstEnums.h).
// Purchase application: PurchaseItem (StoreScreen.cpp:PurchaseItem).
// PURCHASE_COUNT_OFFSET = 1000 (PlayerInfo.h:5).
export const PURCHASE_OFFSET = 1000;
// StoreItem indices (ConstEnums.h order).
export const STORE = {
  GATLING: 0, TWIN: 1, GLOOM: 2, CATTAIL: 3, MELON: 4, MAGNET: 5, SPIKE: 6, COB: 7,
  IMITATER: 8, MOWER: 9, MARIGOLD1: 10, MARIGOLD2: 11, MARIGOLD3: 12,
  WATERCAN: 13, FERTILIZER: 14, BUGSPRAY: 15, PHONOGRAPH: 16, GLOVE: 17,
  SHROOMGARDEN: 18, WHEELBARROW: 19, STINKY: 20, SLOTS: 21, POOL: 22, ROOF: 23,
  RAKE: 24, AQUARIUM: 25, CHOCOLATE: 26, WISDOM: 27, TREEFOOD: 28, FIRSTAID: 29,
  PVZ: 30, INVALID: -1,
};
export const MAX_SPOTS = 8;
export const NUM_PAGES = 4;
// PAGE_SLOT_UPGRADES / PLANT_UPGRADES / ZEN1 / ZEN2 (ConstEnums.h StorePages).
export const PAGE = { SLOTS: 0, PLANTS: 1, ZEN1: 2, ZEN2: 3 };
// gStoreItemSpots (StoreScreen.cpp:35-44). INVALID = -1.
export const SPOTS = [
  [21, 22, 24, 23, 0, 1, 2, 3],
  [6, 5, 4, 7, 8, 29, -1, -1],
  [10, 11, 12, 13, 14, 15, 16, 17],
  [18, 25, 19, 20, 27, 28, -1, -1],
];
// StoreScreen::GetItemCost. Bonus mower 200 first then 500 (uses Purchases,
// not the 75/500/2000/8000 slot table).
export function itemCost(item, purchases) {
  const p = purchases?.[21] | 0 || 0;
  const mowerN = purchases?.[9] | 0 || 0;
  switch (item) {
    case 9: return mowerN ? 500 : 200;
    case 0: return 500;
    case 1: return 500;
    case 2: return 750;
    case 3: return 1000;
    case 4: return 1000;
    case 5: return 300;
    case 6: return 750;
    case 7: return 2000;
    case 8: return 3000;
    case 10: case 11: case 12: return 250;
    case 13: return 1000;
    case 14: return 75;
    case 15: return 100;
    case 16: return 1500;
    case 17: return 100;
    case 18: return 3000;
    case 19: return 20;
    case 20: return 300;
    case 21: return p === 0 ? 75 : p === 1 ? 500 : p === 2 ? 2000 : 8000;
    case 22: return 100;
    case 23: return 300;
    case 24: return 20;
    case 25: return 3000;
    case 27: return 1000;
    case 28: return 250;
    case 29: return 200;
    default: return 0;
  }
}
// StoreScreen::IsPageShown. Trial-locked shows only the slot page (no trial
// mode in this port — never trial-locked). Finished adventure shows all;
// plant page needs level>=42, zen1 needs level>=45, zen2 hidden until finished.
export function isPageShown(page, level, finished) {
  if (finished) return true;
  if (page === 1) return level >= 42;
  if (page === 2) return level >= 45;
  return page !== 3;
}
// StoreScreen::IsComingSoon.
export function isComingSoon(item, purchases, finished) {
  if (item === 19) return !(purchases[18] || purchases[25]);
  if (item === 10 || item === 11 || item === 12) return !finished;
  if (item === 28) return !purchases[27] || purchases[28] < PURCHASE_OFFSET;
  return false;
}
// StoreScreen::IsItemSoldOut.
export function isSoldOut(item, purchases) {
  if (item === -1) return false;
  if (item === 21) return purchases[21] >= 4;
  if (item === 14 || item === 15) return purchases[item] - PURCHASE_OFFSET > 15;
  if (item === 28) return purchases[28] - PURCHASE_OFFSET >= 10;
  if (item === 9) return purchases[9] >= 2;
  if (item === 10 || item === 11 || item === 12) {
    // Source also ORs ZenGarden::IsZenGardenFull(true) — no Zen Garden in
    // this port's scope, so the garden is never full and the date check is
    // the whole rule.
    return purchases[item] === daysSince2000();
  }
  return !!purchases[item];
}
// StoreScreen::IsItemUnavailable (active-branch only; the commented-out
// HasFinishedAdventure early-return is dead code in source).
export function isUnavailable(item, level, finished) {
  if (finished) return false;
  switch (item) {
    case 23: return level < 42;
    case 2: case 3: return level < 35;
    case 6: case 5: return level < 41;
    case 4: case 7: case 8: case 29: return true;
    default: return false;
  }
}
// StoreScreen::GetStorePosition (GameConstants.h offsets: row1 x422/y206,
// row2 x372/y310, cell 74).
export function spotXY(i) {
  if (i <= 3) return { x: 422 + 74 * i, y: 206 };
  return { x: 372 + 74 * (i - 4), y: 310 };
}
export const COINBANK = { x: 650, y: 559 };
export const PAGESTR = { x: 470, y: 559 };
// LawnCommon.cpp GetCurrentDaysSince2000: local-calendar days since 2000
// (tm_year - 100 leap cycle + tm_yday). C++ division truncates toward zero,
// so Math.trunc — not floor — is the faithful op for the (dy - 1) terms.
// Marigold buy/sold-out both stamp through here (StoreScreen 156/259).
export function daysSince2000(d = new Date()) {
  const dy = d.getFullYear() - 2000;
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const mid = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const yday = Math.round((mid - jan1) / 86400000);
  return dy * 365 + Math.trunc((dy - 1) / 400) - Math.trunc((dy - 1) / 100) + Math.trunc((dy - 1) / 4) + yday + 1;
}
// Shop plant -> seed index (seed = item + 40 for items 0..8:
// gatling 40, twin 41, gloom 42, cattail 43, melon 44, magnet 45, spike 46,
// cob 47, imitater 48). Retail DrawSeedPacket(item + 40).
export function seedForItem(item) { return item + 40; }
