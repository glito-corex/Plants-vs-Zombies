// PlayerInfo + ProfileMgr equivalent (Lawn/System/PlayerInfo.cpp, ProfileMgr.cpp, LawnApp SaveDetails).
// Source: PlayerInfo { mName, mLevel (next adventure level 1..50), mCoins, mFinishedAdventure,
//   mPurchases[80] (PACKET_UPGRADE etc), challenge records... }. ProfileMgr holds multiple users.
// This port keeps the fields the task needs (name/level/coins/finished + packet upgrade + options)
// and persists them as JSON. Old single-profile key migrates into users[0].
const KEY2 = "pvz-cleanroom-save-v2";
const KEY1 = "pvz-cleanroom-save-v1";

function freshUser(name) {
  // LawnApp::PlayerInfo::mNeedsMagicTacoReward (set when beating adventure L34
  // unfinished, cleared by the store 603 taco handoff — GameSelector routes
  // level 35 through SetupForIntro(601) while it is set).
  return { name, level: 1, coins: 0, finished: false, packetUpgrade: 0, didntPacket: 0, needsMagicTacoReward: 0, save: null, defeated: [], purchases: new Array(80).fill(0) };
}
function sanitizeUser(u, i) {
  const name = typeof u?.name === "string" && u.name.trim() ? u.name.slice(0, 12) : ("Player" + (i + 1));
  // AlmanacInitForPlayer / AlmanacPlayerDefeatedZombie (AlmanacDialog 674-683):
  // per-profile set of defeated zombie almanac indices (0..25). Validated to
  // ints in range; corrupt shapes reset to empty.
  let defeated = [];
  if (Array.isArray(u?.defeated)) {
    const seen = new Set();
    for (const d of u.defeated) {
      const n = d | 0;
      if (n >= 0 && n < 26 && !seen.has(n)) { seen.add(n); defeated.push(n); }
    }
  }
  // StoreScreen::mPurchases[80] (PlayerInfo 0x1C0): full purchase inventory.
  // Index = StoreItem (gatling 0 ... packet_upgrade 21, pool 22, roof 23,
  // rake 24, aquarium 25, chocolate 26, wisdom 27, treefood 28, firstaid 29).
  // Fertilizer/bug/treefood ride at PURCHASE_COUNT_OFFSET 1000 + count.
  // packetUpgrade mirrors purchases[21] (pre-shop Dave offers + bank sizing).
  let purchases = new Array(80).fill(0);
  if (Array.isArray(u?.purchases)) {
    for (let i = 0; i < 80; i++) {
      const n = u.purchases[i] | 0;
      purchases[i] = n < 0 ? 0 : n;
    }
  }
  const puBackfill = Math.min(4, Math.max(0, u?.packetUpgrade | 0 || 0));
  if (purchases[21] < puBackfill) purchases[21] = puBackfill;
  return {
    name,
    level: Math.min(50, Math.max(1, u?.level | 0 || 1)),
    coins: Math.max(0, u?.coins | 0 || 0),
    finished: !!u?.finished,
    packetUpgrade: Math.min(4, purchases[21] | 0 || 0),
    // PlayerInfo::mDidntPurchasePacketUpgrade (declined Dave's pre-shop
    // slot offers; 2+ declines stop the offers — CutScene 647/658/668).
    // Missing on old saves (new field) → 0.
    didntPacket: Math.max(0, u?.didntPacket | 0 || 0),
    // LawnApp::PlayerInfo::mNeedsMagicTacoReward (0x340, SyncLong). Missing
    // on old saves (new field) → 0.
    needsMagicTacoReward: Math.max(0, u?.needsMagicTacoReward | 0 || 0),
    defeated,
    // Mid-level adventure snapshot (Board::TryToSaveGame -> userdata/game*.dat,
    // per-profile via mPlayerInfo->mId). Lives on the profile so the save
    // travels with the user. Validated loosely; corrupt shapes are dropped.
    save: sanitizeSave(u?.save),
    purchases,
  };
}
// LawnSaveGame guard equivalent: the snapshot must at least name a level and
// carry a board blob, or it is treated as no-save (TryLoadGame FileExists).
function sanitizeSave(s) {
  if (!s || typeof s !== "object") return null;
  const level = s.level | 0;
  if (level < 1 || level > 50) return null;
  if (!s.snap || typeof s.snap !== "object") return null;
  return s;
}
function loadAll() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY2));
    if (s && Array.isArray(s.users) && s.users.length) {
      const users = s.users.map(sanitizeUser).slice(0, 8);
      const cur = Math.min(users.length - 1, Math.max(0, s.cur | 0 || 0));
      const options = { music: typeof s.options?.music === "number" ? s.options.music : 0.8, sfx: typeof s.options?.sfx === "number" ? s.options.sfx : 1 };
      return { users, cur, options };
    }
  } catch (e) { /* fresh */ }
  // migrate v1 single profile
  try {
    const o = JSON.parse(localStorage.getItem(KEY1));
    if (o && typeof o.level === "number") {
      const u = sanitizeUser({ name: "Player1", level: o.level, coins: o.coins, finished: o.finished }, 0);
      const all = { users: [u], cur: 0, options: { music: 0.8, sfx: 1 } };
      storeAll(all);
      return all;
    }
  } catch (e) { /* ignore */ }
  return { users: [], cur: 0, options: { music: 0.8, sfx: 1 } };
}
function storeAll(s) {
  try { localStorage.setItem(KEY2, JSON.stringify(s)); } catch (e) { /* private mode */ }
}
let S = loadAll();
function cur() { return S.users[S.cur] || null; }

export function listUsers() { return S.users.map((u) => ({ ...u })); }
export function currentUser() { const u = cur(); return u ? { ...u } : null; }
export function currentIndex() { return S.cur; }
// LawnApp::mPlayerInfo->GetLevel/SetLevel
export function getLevel() { return cur()?.level ?? 1; }
export function setLevel(lv) { const u = cur(); if (!u) return; u.level = Math.min(50, Math.max(1, lv)); storeAll(S); }
export function hasFinishedAdventure() { return !!cur()?.finished; }
export function getCoins() { return cur()?.coins ?? 0; }
export function addCoins(n) { const u = cur(); if (!u) return; u.coins = Math.min(99999, Math.max(0, u.coins + n)); storeAll(S); }
// PlayerInfo::mPurchases[PACKET_UPGRADE] (extra seed slots) + MakeNewBoard
// reads (Board 8848: +6). buyPacketUpgrade mirrors the Dave dialog YES
// branch (CutScene 1660-1665): deduct, +1 upgrade, persist.
export function getPacketUpgrade() { const u = cur(); return u ? Math.min(4, (u.purchases?.[21] | 0) || (u.packetUpgrade | 0) || 0) : 0; }
export function buyPacketUpgrade(cost) {
  const u = cur();
  if (!u || u.coins < cost) return false;
  u.coins -= cost;
  const nv = Math.min(4, ((u.purchases?.[21] | 0) || (u.packetUpgrade | 0) || 0) + 1);
  if (u.purchases) u.purchases[21] = nv;
  u.packetUpgrade = nv;
  storeAll(S);
  return true;
}
// StoreScreen::mPurchases full inventory (PlayerInfo 0x1C0). Index = StoreItem.
// PURCHASE_COUNT_OFFSET = 1000 (PlayerInfo.h:5) for consumable counts.
export const PURCHASE_OFFSET = 1000;
export function getPurchases() { const u = cur(); return u?.purchases ? [...u.purchases] : new Array(80).fill(0); }
export function getPurchase(i) { const u = cur(); return u?.purchases ? (u.purchases[i | 0] | 0) : 0; }
export function setPurchase(i, v) { const u = cur(); if (!u) return; if (!u.purchases) u.purchases = new Array(80).fill(0); u.purchases[i | 0] = Math.max(0, v | 0); if ((i | 0) === 21) u.packetUpgrade = Math.min(4, Math.max(0, v | 0)); storeAll(S); }
// StoreScreen::PurchaseItem persistence (LawnApp::WriteCurrentUserConfig after
// every purchase). spendCoins deducts (returns false when unaffordable);
// buyStoreItem applies the per-item inventory rule then persists.
export function spendCoins(n) { const u = cur(); if (!u) return false; if (u.coins < n) return false; u.coins -= n; storeAll(S); return true; }
// PlayerInfo::mDidntPurchasePacketUpgrade (CutScene 1678: +1 per decline).
export function getDidntPacket() { return cur()?.didntPacket | 0 || 0; }
export function incDidntPacket() { const u = cur(); if (!u) return; u.didntPacket = (u.didntPacket | 0) + 1; storeAll(S); }
// LawnApp::PlayerInfo::mNeedsMagicTacoReward (Zombie::TrySpawnLevelAward L34
// taco reward flag). Set when beating adventure L34 unfinished
// (UpdatePlayerProfileForFinishingLevel 1381-1384), cleared by the store 603
// taco handoff (StoreScreen::AdvanceCrazyDaveDialog 1070-1073).
export function getNeedsMagicTaco() { return (cur()?.needsMagicTacoReward | 0) || 0; }
export function setNeedsMagicTaco(v) { const u = cur(); if (!u) return; u.needsMagicTacoReward = Math.max(0, v | 0); storeAll(S); }
export function clearNeedsMagicTaco() { const u = cur(); if (!u || !u.needsMagicTacoReward) return; u.needsMagicTacoReward = 0; storeAll(S); }
// AlmanacPlayerDefeatedZombie (AlmanacDialog.cpp:680): mark a zombie almanac
// index (0..25) defeated for the current profile. Called from the sim via
// main.js (Board.zombieDefeated flush), not from sim.js directly — the sim
// stays save-free so headless tests never touch localStorage.
export function hasDefeatedZombie(idx) { const u = cur(); return !!u && Array.isArray(u.defeated) && u.defeated.includes(idx | 0); }
export function markZombieDefeated(idx) {
  const u = cur();
  if (!u) return;
  const n = idx | 0;
  if (n < 0 || n >= 26) return;
  if (!Array.isArray(u.defeated)) u.defeated = [];
  if (!u.defeated.includes(n)) { u.defeated.push(n); storeAll(S); }
}
// Board::TryToSaveGame slot (per-profile adventure snapshot). WriteCurrentUserConfig
// persists the profile on every mutation already (storeAll), so no flush call
// is needed at quit time — the save rides along with the profile record.
export function getAdvSave() { return cur()?.save || null; }
export function setAdvSave(s) { const u = cur(); if (!u) return; u.save = sanitizeSave(s); storeAll(S); }
export function clearAdvSave() { const u = cur(); if (!u || !u.save) return; u.save = null; storeAll(S); }
// LawnApp::WriteCurrentUserConfig / PlayerInfo::SaveDetails — call after level win (Board::LevelComplete).
export function completeLevel(level, money) {
  const u = cur();
  if (!u) return;
  // source AwardScreen finish: mLevel = min(50, level+1); finished if 50; coins += money
  if (level >= u.level) u.level = Math.min(50, level + 1);
  if (level >= 50) u.finished = true;
  // LawnApp::UpdatePlayerProfileForFinishingLevel (1381-1384): beating
  // adventure L34 unfinished sets mNeedsMagicTacoReward (the L35 store 601
  // intro plays on the next adventure entry while it is set).
  if (level === 34 && !u.finished) u.needsMagicTacoReward = 1;
  u.coins += money;
  storeAll(S);
}
export function createUser(name) {
  const clean = (name || "").trim().slice(0, 12) || ("Player" + (S.users.length + 1));
  S.users.push(freshUser(clean));
  S.cur = S.users.length - 1;
  storeAll(S);
  return { ...S.users[S.cur] };
}
export function selectUser(i) { if (S.users[i]) { S.cur = i; storeAll(S); } }
export function deleteUser(i) {
  if (!S.users[i]) return;
  S.users.splice(i, 1);
  S.cur = Math.min(S.cur, Math.max(0, S.users.length - 1));
  storeAll(S);
}
export function renameUser(i, name) {
  if (!S.users[i]) return;
  S.users[i].name = (name || "").trim().slice(0, 12) || S.users[i].name;
  storeAll(S);
}
// options (NewOptionsDialog sliders) — global like LawnApp registry, not per-user
export function getOptions() { return { ...S.options }; }
export function setOptions(o) { S.options = { ...S.options, ...o }; storeAll(S); }

// Back-compat for existing screens: {level, finished, coins} live view + storeSave(save)
export function loadSave() {
  const u = cur();
  if (!u) return { level: 1, finished: false, coins: 0, needsUser: true };
  return { level: u.level, finished: u.finished, coins: u.coins, name: u.name };
}
export function storeSave(s) {
  const u = cur();
  if (!u || !s) return;
  if (typeof s.level === "number") u.level = Math.min(50, Math.max(1, s.level));
  if (typeof s.finished === "boolean") u.finished = s.finished;
  if (typeof s.coins === "number") u.coins = Math.max(0, s.coins | 0);
  storeAll(S);
}
