// Bot player: plays adventure hands-free with humanized inputs (src/bot.js).
// Activated by holding B and clicking the Adventure tombstone in the main menu
// (see handleMenuClick in main.js); B+Adventure again (or window.__pvz.bot.stop())
// stops it. The bot drives ONLY real canvas input events (mousemove/mousedown/
// mouseup/click) at game coords, so it exercises the same path as a human hand —
// hover states, press/release match, tutorial transitions and all. It reads
// state from window.__pvz.G (never pokes sim internals to plant/collect).
//
// Strategy (adventure 1-40 scope: day, night, pool, bowling, mini-boss, fog, vasebreaker): sun
// economy grown whenever defense is satisfied (sunflowers by day,
// sun-shrooms by night — there is no sky sun at night, so the 25-sun shroom
// is the whole economy), gun lanes earned by observed bulk (cheap peas
// first, snow second for the chill, repeaters when rich — up to three
// barrels a row; at night the FREE puff-shroom is the first barrel in every
// row, with fume/scarety pierce as the utility second), wall-nuts
// (tall-nuts for vaulters and the heaviest pushes when on hand) at the
// rightmost ground left of the horde, gravebusters on standing stones once
// defense holds (stones spawn grave-rise zombies behind the line),
// potato mines only on the right half (human columns 5-9, 0-indexed 4-8)
// and only where they can arm in time, never blocked in by other plants
// (early: solo single-target openers while the sun builds; late: ahead of
// the front line as supplements to the other plants),
// chompers behind working walls or as last-ditch close instants, cherry
// bombs only on clumps the guns can't chew or last-resort door saves
// (mowerless lanes first, mowerless pressure rebuilds faster), need-based
// conveyor picks on L5/L10/L20/L30, prize seed picks on chooser levels.
// Pool (L21-30): nothing plants on water without a live lily pad first
// (Board::CanPlantAt pool branch — the sim's canPlant gate). The bot never
// lifts a seed for a pool tile unless the tile is already lily-ready; when
// its strategy wants a pool tile that lacks a lily it plants the lily (seed
// 16) there first, then the wanted plant once canPlant passes.
// Pool day (L21-29, BG.POOL): land rows play like day (pea/snow/repeater,
// walls, potato on LAND only); water rows (2-3) play tangle-first — the
// 25-sun Tangle Kelp (19) plants in BARE water (no lily, lily blocks it)
// and drags one swimmer under, so it answers water scouts/bulkies without
// the 125-sun lily+pea tax. Lily pads (16) lead only for lily-needing water
// guns/walls (pea/snow/threepeater/wall/squash/chomper); threepeater (18)
// is the premium water gun (3 lanes cover the 6-row pool) when rich;
// squash (17) is the cheap water door-save. Sea-shroom (24) SLEEPS by day
// (nocturnal + day pool = sleeping, needs coffee the bot never carries),
// so the day-pool book deliberately excludes it — it rides the night/fog
// gun order as a free bare-water spammer where it is awake.
// Idle-rich upgrades: with nothing left to plant (decidePickup -1), a big
// sun stockpile and no recent planting, the bot shovels a weaker barrel to
// replant a stronger one in the same cell (pea->repeater, puff->fume) —
// calm rows only, cherry reserve kept.
// Whack-a-Zombie (L15): the hammer does the work (closest-to-the-house
// first, fewest-swings tiebreak), cherry answers verified clumps (the final
// batches especially), gravebuster thins future batches (batch size caps at
// standing graves), potato mines arm ahead of far walkers. Swings run a
// human 130-250ms cadence (panic-hurried, never machine-gun) on top of the
// usual travel time + press dwell.
// Vasebreaker (L35): no sun, no bank, no chooser — every plant arrives as a
// usable-seed coin from a smashed vase (pea/snow shooters, squash instants,
// hypno converters vs the table's normal/bucket/football/dancer/jack). The
// bot plays blind like a human: leaf-marked vases are known seeds and break
// first, question vases break blind and are answered after they pop. One
// smash at a time (the mallet runs ~20t), one plant at a time (each coin is
// picked up and planted before the next break). Dave is clicked through
// (intro + both intermissions; the 2702/2801 advance populates the next
// stage). Safety: never break into an unanswered close threat, never pile up
// unplanted coins, never smash next to a live jack-in-the-box (its blast
// chains nearby vases open).
// Pace is threat-driven: calm 0.7–1.6s cadence, down to ~0.2–0.4s with
// faster hands at full panic. Stops after the level-40 award (roof rows are
// out of the verified scope).
// Fog (L31-40, BG.FOG): the fog renders above everything, including flying
// balloons, so the bot plays by the same visibility rule — it never sees or
// reacts to zombies hidden in dense fog (foeVisible gates rowFoes, the
// opening book, cherry targeting and urgency). Planterns (25) light the
// lawn (two lamps, inner land rows, protected col 1) so the guns — and the
// bot — can see the right side again. Balloons are answered two ways:
// blover (27) reactively when a visible flyer is on the lawn (one blow
// clears every flying balloon board-wide plus the fog), and cactus (26)
// per-row where a flyer walks (HIGH spikes pop it; LOW spikes still chew
// ground, so it doubles as the row gun). Lamps sit IN the fog (right-side
// fog columns): a lamp left of the bank clears nothing once the roll
// offset settles, so planternCell scores cells by the dense fog their
// diamond actually covers and skips useless ones.
import { TUT, ROSTER } from "./pvz/sim.js";
import { BG, backgroundForLevel, gridToPixelX, gridToPixelY, isShooter, lawnXMin, cellW, PLANTS } from "./pvz/data.js";
import * as SAVE from "./pvz/save.js";

const W = 800, H = 600;
const canvas = () => document.getElementById("pvzCanvas");
const G = () => window.__pvz.G;

// ---- tiny geometry mirrors (pure formulas duplicated from main.js/data.js) ----
const PACKET_Y = 9; // main.js: packets sit 9px down in the play bank
const SHOVEL_X = 83 - 14 + 516 + 4; // = 589, main.js SHOVEL_X
function packetX(n, i) { // main.js packetX (Board::GetSeedPacketPositionX)
  if (n <= 7) return i * 59 + 85;
  if (n === 8) return i * 54 + 81;
  if (n === 9) return i * 52 + 80;
  return i * 51 + 79;
}
function chooserGridPos(i, seven) { // main.js chooserGridPos
  return { x: (i % 8) * 53 + 22, y: Math.floor(i / 8) * (seven ? 70 : 73) + (seven ? 123 : 128) };
}

// ---- humanization: timing + cursor motion ----
const rand = (a, b) => a + Math.random() * (b - a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bot = {
  running: false, timer: null, busy: false, last: { x: 400, y: 300 },
  stopLevel: 40, losses: {}, log: [], lastAwardLv: -1, trail: [],
  placeBan: {}, seedBan: {}, // failed placements: "seed@c,r" -> until, seed -> until (ms timestamps)
  lastPlantAt: null, // last confirmed plant (performance.now; null = never) — upgrades only after a quiet stretch
  upg: null, // pending gun upgrade: {c, r, from, to, phase, tries, board}
};
function say(s) {
  bot.log.push(`[${new Date().toLocaleTimeString()}] ${s}`);
  if (bot.log.length > 80) bot.log.shift();
}
// Game coords -> client coords for synthetic events.
function toClient(gx, gy) {
  const r = canvas().getBoundingClientRect();
  return { x: r.left + (gx / W) * r.width, y: r.top + (gy / H) * r.height };
}
function dispatch(type, gx, gy) {
  const c = toClient(gx, gy);
  const ev = new MouseEvent(type, {
    clientX: c.x, clientY: c.y, button: 0, bubbles: true, cancelable: true,
  });
  ev.botHands = true; // main.js: bot presses get bot-only input rules
  canvas().dispatchEvent(ev);
}
// Human cursor: multi-leg arced paths with mid-course re-aims, speed wobble,
// lateral drift, and occasional overshoot-then-correct — never a straight
// A→B ruler line. Travel time IS the pacing; there are no dead waits here.
async function moveTo(gx, gy) {
  const u = bot.urg || 0;
  let from = { ...bot.last };
  const dx = gx - from.x, dy = gy - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1.5) return;
  const speed = rand(1300, 2100) * (1 + u * 1.6); // panic hands hurry, still human
  // Legs: the hand re-aims once or twice on longer trips instead of drawing
  // one perfect segment. Waypoints sit off the straight line (arcs), with a
  // little slide along the path so legs aren't symmetric.
  const legs = dist > 320 ? 3 : dist > 130 ? 2 : 1;
  const nx = -dy / dist, ny = dx / dist; // perpendicular
  const ux = dx / dist, uy = dy / dist; // along path
  const pts = [];
  for (let i = 1; i < legs; i++) {
    const f = i / legs;
    const off = rand(-1, 1) * Math.min(46, dist * 0.09);
    const along = rand(-14, 14);
    pts.push({ x: from.x + dx * f + nx * off + ux * along, y: from.y + dy * f + ny * off + uy * along });
  }
  // Final approach: sometimes overshoot past the target and correct back,
  // sometimes land with a small error the press absorbs.
  if (legs >= 2 && Math.random() < 0.3) {
    const ox = ux * rand(6, 16), oy = uy * rand(6, 16);
    pts.push({ x: gx + ox + rand(-2, 2), y: gy + oy + rand(-2, 2) });
  }
  pts.push({ x: gx + rand(-2.5, 2.5), y: gy + rand(-2.5, 2.5) });
  bot.trail.push({ a: [Math.round(from.x), Math.round(from.y)], via: pts.map((p) => [Math.round(p.x), Math.round(p.y)]), b: [gx, gy] });
  if (bot.trail.length > 40) bot.trail.shift();
  for (const p of pts) {
    const sx = p.x - from.x, sy = p.y - from.y;
    const d = Math.hypot(sx, sy);
    if (d >= 0.75) {
      const dur = Math.max(30, (d / speed) * 1000 * rand(0.85, 1.25));
      const t0 = performance.now();
      const easePow = rand(1.6, 2.8); // attack/decay varies every leg
      const wob = rand(0.4, 1.4), wobF = rand(1, 2.5), ph = rand(0, Math.PI * 2);
      const pxn = -sy / d, pyn = sx / d;
      for (;;) {
        const t = Math.min(1, (performance.now() - t0) / dur);
        const e = t < 1 ? 1 - Math.pow(1 - t, easePow) : 1;
        const wobble = Math.sin(e * Math.PI * wobF + ph) * wob * Math.sin(e * Math.PI);
        const jx = t < 1 ? rand(-0.9, 0.9) : 0;
        const jy = t < 1 ? rand(-0.9, 0.9) : 0;
        const px = from.x + sx * e + pxn * wobble + jx;
        const py = from.y + sy * e + pyn * wobble + jy;
        dispatch("mousemove", px, py);
        bot.last = { x: px, y: py };
        if (t >= 1) break;
        await sleep(rand(8, 18));
      }
    }
    from = { x: p.x, y: p.y };
  }
  bot.last = { x: gx + rand(-1, 1), y: gy + rand(-1, 1) };
  dispatch("mousemove", bot.last.x, bot.last.y);
}
async function clickAt(gx, gy) {
  await moveTo(gx, gy);
  await pressAt();
}
// Press where the finger already is (split from clickAt so the bot can
// re-validate the target after the hand travels — the lawn moves under it).
async function pressAt() {
  await sleep(rand(15, 50)); // finger lands, then presses
  dispatch("mousedown", bot.last.x, bot.last.y);
  await sleep(rand(50, 110) * (1 - (bot.urg || 0) * 0.4)); // press dwell
  dispatch("mouseup", bot.last.x, bot.last.y);
  dispatch("click", bot.last.x, bot.last.y);
}
// Disarm a held seed/shovel/conveyor packet like a human cancels: Escape.
// (ClearCursor path; guarded so a stray call can never open the pause menu.)
async function cancelHold() {
  const g = G();
  if (g.selSeed < 0 && g.selConvIdx < 0 && !g.shovelMode) return;
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  window.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape", bubbles: true }));
  await sleep(rand(30, 80));
}
// ---- failed-placement memory ----
// A placement click can fail after a good choice: the cell was plantable at
// decide time but not at press time (a corpse still registers until the sim
// nulls it, sun/recharge state moved, the click straddled a cell edge).
// Without memory the next think re-picks the same seed + cell forever. So a
// failed attempt disarms, bans the (seed, cell) briefly, bans the seed even
// more briefly (reconsider other seeds first), and the bot rethinks.
function placeKey(seed, cell) { return seed + "@" + cell.c + "," + cell.r; }
function seedBanned(s) {
  const until = bot.seedBan[s];
  if (!until) return false;
  if (performance.now() > until) { delete bot.seedBan[s]; return false; }
  return true;
}
function isPlaceBanned(seed, cell) {
  const k = placeKey(seed, cell);
  const until = bot.placeBan[k];
  if (!until) return false;
  if (performance.now() > until) { delete bot.placeBan[k]; return false; }
  return true;
}
function notePlaceFail(seed, cell) {
  bot.placeBan[placeKey(seed, cell)] = performance.now() + 15000;
  bot.seedBan[seed] = performance.now() + 8000;
  say(`plant ${seed} @${cell.c},${cell.r} failed — banned, reconsidering`);
}
function noteNoCell(seed) { // picked up but nowhere plantable: deprioritize briefly
  bot.seedBan[seed] = performance.now() + 5000;
  say(`plant ${seed} has no cell — reconsidering`);
}
function clearPlaceBansFor(seed) {
  for (const k of Object.keys(bot.placeBan)) if (k.startsWith(seed + "@")) delete bot.placeBan[k];
  delete bot.seedBan[seed];
}
async function typeName(name) {
  for (const ch of name) {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: ch, bubbles: true }));
    await sleep(rand(90, 220));
  }
}
function trackPos(name) { // mirror of main.js trackPos (falls back the same way)
  const FALLBACK = {
    SelectorScreen_StartAdventure_button: [405, 65],
    SelectorScreen_Adventure_button: [405, 80],
    SelectorScreen_BG_Right: [71, 41],
  };
  const r = G().menuReanim;
  if (r) {
    try {
      const t = r.getCurrentTransform(r.findTrackIndex(name));
      if (t && isFinite(t.x)) return { x: Math.round(t.x), y: Math.round(t.y) };
    } catch (e) { /* fall through */ }
  }
  const f = FALLBACK[name] || [0, 0];
  return { x: f[0], y: f[1] };
}

// ---- sensing ----
function rowShooters(b, row) {
  let n = 0;
  for (let c = 0; c < 9; c++) {
    const cell = b.cell(c, row);
    // Sleeping shooters (day-pool sea-shroom) never fire — don't count them
    // as defense, or rowPressure stays satisfied on a sleeping row.
    if (cell && cell.base && !cell.base.dead && !cell.base.sleeping && isShooter(cell.base.seed)) n++;
  }
  return n;
}
function rowNuts(b, row) {
  for (let c = 0; c < 9; c++) {
    const cell = b.cell(c, row);
    if (cell && cell.base && !cell.base.dead && (cell.base.seed === 3 || cell.base.seed === 23)) return true;
  }
  return false;
}
// ---- threat model: high HP + fast + close-to-the-house, in that order ----
// Zombies walk right-to-left (house at x≈40, mowers at x≈-27), so a smaller x
// is closer to the house. Bulk is what still needs chewing through (body +
// armor pools); pace is px/tick toward the house (0 while stalled chewing).
function rowFoes(b, row) {
  const out = [];
  for (const z of b.zombies) {
    if (z.dead || z.gone || z.mowed || (z.type === "bungee" && !z.bungeeOnLawn()) || z.houseWalk || z.ally) continue;
    if (z.row !== row) continue;
    if (!foeVisible(z, b)) continue; // fog-of-war: hidden zombies don't exist yet
    out.push(z);
  }
  return out;
}
// ---- fog-of-war: the bot sees what the fog render shows ----
// Fog (Board::gridCelFog, [9][rows+1] density 0-255) renders above ALL
// entities including flying balloons, so the bot must not react to zombies
// standing in dense fog — no guns, nuts, cherries, urgency or instants for
// what it can't see. Columns left of the fog bank stay permanently clear
// (UpdateFog only raises cols >= leftFogColumn); plantern holes fade back
// toward 0. Threshold 150: lit/clear cells read ~0, dense banks cap at
// 200 (left column) / 255.
function isFog(b) {
  try { return !!(b && typeof b.stageHasFog === "function" && b.stageHasFog()); }
  catch (e) { return !!b && b.bg === BG.FOG; }
}
function fogDensityAt(b, z) {
  try {
    if (!b || typeof b.stageHasFog !== "function" || !b.stageHasFog()) return 0;
    if (!b.gridCelFog) return 0;
    const col = Math.max(0, Math.min(8, Math.floor((z.x - lawnXMin(b.bg)) / cellW(b.bg))));
    const colArr = b.gridCelFog[col];
    if (!colArr) return 0;
    return colArr[Math.max(0, Math.min(b.rows, z.row))] | 0;
  } catch (e) { return 0; }
}
function foeVisible(z, b) { return fogDensityAt(b, z) < 150; }
function rowHasSeed(b, r, seed) {
  for (let c = 0; c < 9; c++) {
    const cell = b.cell(c, r);
    const p = cell && cell.base;
    if (p && !p.dead && p.seed === seed) return true;
  }
  return false;
}
function zBulk(z) {
  return Math.max(0, (z.hp || 0) + (z.helm || 0) + (z.shield || 0) + (z.paper || 0) + (z.ladder || 0));
}
function zPace(z) { // px/tick toward the house; conservative (uses velX, not the ~0.47x ground rate)
  if (z.eating || z.butter > 0) return 0;
  if (z.vaultT > 0) return Math.abs(z.vaultVel || z.velX || 0);
  let v = z.velX || 0;
  if (z.chill > 0 && !(ROSTER[z.type] && ROSTER[z.type].chillImmune)) v *= 0.5;
  return Math.max(0, v);
}
function zCanChew(z) { // smashers and flyers don't chew: they crush / pass over
  if (!z.hasHead || z.houseWalk || z.flying) return false;
  return !["boss", "garg", "zamboni", "catapult"].includes(z.type);
}
function zAttackDx(z) { // left edge of the bite rect, relative to z.x (sim attackRect)
  switch (z.type) {
    case "ladder": case "pogo": return 10;
    case "snorkel": return -5;
    case "balloon": return 20;
    case "dolphin": return -29;
    case "pole": case "football": case "dancer": case "backup":
    case "imp": case "digger": case "bobsled": return 50;
    default: return 20;
  }
}
function zProx(z) { // 0 still offscreen-right → 1 at the door (x≤200)
  return Math.min(1, Math.max(0, (760 - z.x) / 560));
}
// Pole-vaulters don't walk the whole way: a headed pre-vault vaulter jumps
// the nearest plant ahead of it (anything but a tall-nut, seed 23 — too tall
// to clear; headless vaulters never jump, Zombie.cpp:1654) and lands ~70px
// past it, behind the front line. Mirrors the sim's vault targeting
// (findVaultTarget picks the rightmost live plant ahead; startVault lands at
// plant.x + 80 - 150).
function isVaultThreat(z) { // zombie that will jump a wall-nut/potato, not chew it
  return z.type === "pole" && z.phase === "prevault" && z.hasHead;
}
function poleVaultPlan(b, z) { // {plant, tVault, landX, vaultDur} or null
  if (!isVaultThreat(z) || z.vaultT > 0) return null;
  let plant = null;
  for (const p of b.allPlants()) {
    if (p.row !== z.row || p.dead) continue;
    if (p.x > z.x) continue; // must be ahead of the zombie
    if (!plant || p.x > plant.x) plant = p; // jumps the nearest one
  }
  if (!plant || plant.seed === 23) return null; // tall-nut blocks the vault
  const pace = zPace(z);
  const tVault = pace > 0.001 ? Math.max(0, (z.x - (plant.x + 79)) / pace) : 0;
  return { plant, tVault, landX: plant.x - 70, vaultDur: 180 };
}
function zThreat(b, z) { // one number per zombie: close × bulky × fast
  const prox = zProx(z);
  if (prox <= 0) return 0;
  // Proximity counts QUADRATICALLY: a zombie halfway to the house is a
  // quarter of a threat, one at the door is the whole threat. Close zombies
  // therefore outshout any number of distant ones — the closest teeth always
  // get the next gun, nut, or cherry first. Far hordes still add up through
  // the row sum, so distant build-up isn't ignored, just deprioritized.
  const bulkW = Math.min(4, Math.max(0.5, zBulk(z) / 270)); // normal ≈ 1, bucket/door/football → 4
  const speedW = Math.min(2, Math.max(0.2, zPace(z) / 0.5)); // stalled ≈ 0.2, mad news/dolphin ≈ 1.8
  let t = prox * prox * bulkW * speedW;
  // A vaulter with something to jump bypasses the whole front line, so it
  // counts extra — the answer is guns now or a tall-nut, not a wall.
  if (poleVaultPlan(b, z)) t *= 1.5;
  return t;
}
function leadFoe(b, row) { // closest foe to the house in the row, or null
  let best = null;
  for (const z of rowFoes(b, row)) if (!best || z.x < best.x) best = z;
  return best;
}
function timeToCellX(b, z, cellRightX) { // ticks until teeth reach a plant cell's right edge
  const reach = z.x + zAttackDx(z);
  const pace = zPace(z);
  let t = pace <= 0.001 ? (reach <= cellRightX + 20 ? 0 : Infinity) : Math.max(0, (reach - cellRightX) / pace);
  // Vault shortcut: the pole jumps its nearest plant and slow-walks (0.3)
  // from the landing, so cells behind the landing arrive much sooner.
  const vp = poleVaultPlan(b, z);
  if (vp && vp.landX <= cellRightX + 40) {
    const post = 0.3 * (z.chill > 0 ? 0.5 : 1);
    t = Math.min(t, vp.tVault + vp.vaultDur + Math.max(0, (vp.landX - cellRightX) / post));
  }
  return t;
}
// A "run" mower is still sweeping its row, so it counts as protection —
// only a spent ("used") or absent (dirt-row null) mower leaves the lane
// with no second chance.
function rowHasMower(b, r) {
  const m = b.mowers && b.mowers[r];
  return !!m && (m.state === "ready" || m.state === "run");
}
function rowNutCredit(b, row) { // tall-nut always holds; a wall-nut is jumped by vaulters
  let tall = false, wall = false;
  for (let c = 0; c < 9; c++) {
    const cell = b.cell(c, row);
    if (cell && cell.base && !cell.base.dead) {
      if (cell.base.seed === 23) tall = true;
      else if (cell.base.seed === 3) wall = true;
    }
  }
  if (tall) return 1.2;
  if (!wall) return 0;
  return rowFoes(b, row).some(isVaultThreat) ? 0.2 : 1.2;
}
function rowPressure(b, row) { // total threat minus what the row's defense already handles
  let score = 0;
  const covered = mineCoveredIds(b, row);
  for (const z of rowFoes(b, row)) {
    if (covered.has(z.id)) continue; // an armed mine answers this one: lane is safe for it
    score += zThreat(b, z);
  }
  // A mowerless lane has no second chance: rebuilding it jumps the queue.
  if (!rowHasMower(b, row)) score += 0.6;
  score -= rowShooters(b, row) * 1.0; // each shooter roughly answers one normal's worth
  score -= rowNutCredit(b, row); // a wall buys the row real time — unless vaulters jump it
  return score;
}
function countSeed(b, seed) { return b.countSeedPlants(seed); }
function playableRows(b) {
  const out = [];
  for (let r = 0; r < b.rows; r++) if (!b.isDirtRow(r)) out.push(r);
  return out;
}
function weakestRow(b, rows) { // most pressure first, tie -> fewest shooters
  // Rows with teeth come first, always: gun/nut credits can drive a defended
  // row's score below an empty row's zero, and the next gun must still go to
  // the teeth — never to an empty lane while zombies walk elsewhere.
  const pool = rows.some((r) => rowFoes(b, r).length > 0)
    ? rows.filter((r) => rowFoes(b, r).length > 0)
    : rows;
  let best = pool[0], bs = -Infinity, bn = Infinity;
  for (const r of pool) {
    const s = rowPressure(b, r), n = rowShooters(b, r);
    if (s > bs || (s === bs && n < bn)) { best = r; bs = s; bn = n; }
  }
  return best;
}
function emptyCell(b, cols, rows, { needBase = true, avoidMine = false } = {}) {
  for (const c of cols) for (const r of rows) {
    const cell = b.cell(c, r);
    if (!cell || cell.crater) continue;
    if (needBase && cell.base && !cell.base.dead) continue;
    if (b.isDirtRow(r)) continue;
    // Never block a live mine in: no plant in front of (right of) it.
    if (avoidMine) {
      const m = mineCol(b, r);
      if (m >= 0 && c > m) continue;
    }
    return { c, r };
  }
  return null;
}
function cellCenter(b, c, r) {
  return { x: gridToPixelX(c, b.bg) + 41, y: gridToPixelY(c, r, b.bg) + 50 };
}
// Coin click point: sun uses a radius hit-test around (x, y) and award
// coins use an exact [x, x+w) box — clicking the top-left corner can
// miss by one floating-point ULP in the client<->game round-trip, so awards
// are clicked at their centers (Board::awardSize widths). Money (silver/
// gold/diamond) is the same half-open box shape ([x, x+60), Coin::
// MouseHitTest) and the hand lands with +/-2.5px jitter, so the old
// corner click missed ~3/4 of press attempts — money is clicked at the
// box center instead (the visible coin face sits inside it).
function coinClickPoint(b, c) {
  if (typeof c.isAward === "function" && c.isAward()) {
    try {
      const [w, h] = b.awardSize(c.kind);
      return { x: c.x + w / 2, y: c.y + h / 2 };
    } catch (e) { return { x: c.x + 25, y: c.y + 35 }; }
  }
  if (typeof c.isSun === "function" && !c.isSun()) return { x: c.x + 30, y: c.y + 30 };
  return { x: c.x, y: c.y };
}

// ---- level context: night, roster ("shown zombies"), graves ----
// The chooser panel shows the level's conditions (background + zombie roster
// + grave stones); the bot reads the same context off the board so its picks
// answer the actual level — night economy/guns, vaulters, grave stones —
// instead of a fixed day list.
function boardNight(b, level) {
  if (b && typeof b.stageIsNight === "function") {
    try { return !!b.stageIsNight(); } catch (e) { /* fall through */ }
  }
  const bg = backgroundForLevel(level || 1);
  return bg === BG.NIGHT || bg === BG.FOG || bg === BG.BOSS;
}
function levelRoster(b) { // exact upcoming-zombie set from the picked waves
  const set = new Set();
  if (b && Array.isArray(b.waves)) for (const w of b.waves) for (const t of w) set.add(t);
  return set;
}
function levelGraves(b, level) {
  if (b) {
    try { if (b.hasGraves()) return true; } catch (e) { /* fall through */ }
    try { if (b.stageHasGraveStones()) return true; } catch (e) { /* fall through */ }
  }
  return boardNight(b, level); // night always grows stones, even pre-placement
}

// ---- seed picks ----
// Preference order, applied to whatever the level offers (never level-gated:
// availability alone decides what lands in the bank). Cherry precedes potato
// globally — a wall-nut plus cheap guns already cover potato's early-stall
// job, while nothing else covers cherry's clump-wipe/door-save job.
const SHOOTERS = [7, 5, 0]; // repeater > snow > pea (by availability)
// Roof guns (retail ballistics: straight shots die on the roof slope, so
// only lobbed catapults count as barrels there — cabbage 32, kernel-pult 34,
// melon-pult 39). Pea/snow/repeater/threepeater/split/starfruit/cactus and
// the sleeping-by-day shrooms are never gun picks on a roof.
const ROOF_GUNS = [32, 34, 39];
const CHOOSER_WANT = [1, 0, 5, 7, 18, 3, 2, 4, 6, 19, 17, 20, 23, 36, 22, 21, 11, 29]; // day book (threepeater/tangle/spike added for pool)
// Night book, built from the level context (availability-gated at push
// time, so short rosters just yield a shorter list). Sun-shroom economy —
// there is no sky sun at night, and the 25-sun shroom doubles the 50-sun
// start (sunflower only before it unlocks) — then the free puff line, the
// wall/cherry/potato core, gravebuster while stones stand (they spawn
// grave-rise zombies behind the line), pierce (fume) / sentry (scaredy)
// guns, tall-nut when vaulters walk, and the day guns as backup barrels.
function chooserWantNight(g, avail) {
  const b = g.board;
  const level = g.chooserLevel ?? g.chooser?.level ?? 1;
  const roster = levelRoster(b);
  const graves = levelGraves(b, level);
  const vaulters = roster.has("pole") || roster.has("pogo");
  const metal = ["bucket", "football", "door", "ladder", "digger", "pogo"].some((t) => roster.has(t));
  const balloon = roster.has("balloon");
  const list = [];
  const push = (s) => { if (avail.has(s) && !list.includes(s)) list.push(s); };
  push(avail.has(9) ? 9 : 1);
  push(8);
  // Fog/night pool: free sea-shroom (24) is awake here and plants in bare
  // water — the pool twin of the free puff line. Day pool never reaches this
  // helper (POOL returns the day book above), so no sleeping-sea leak by day.
  try {
    const bg = (b && b.bg) || backgroundForLevel(level);
    if (bg === BG.FOG || bg === BG.POOL) push(24);
  } catch (e) { /* board-less staging: skip sea */ }
  push(3); push(2); push(4); push(12); // hypno: the night instant — a lone bulky walker eats it and turns (awake at night, no coffee needed). Ranks ahead of the gravebuster: instant defense beats slow clearing on the base 6-slot bank; graves return with slot 7+.
  if (graves) push(11);
  push(10); push(13);
  if (vaulters) push(23);
  push(0); push(6); push(5); push(7);
  if (metal) push(31);
  if (balloon) push(27);
  push(17); push(20); push(36); push(22); push(29);
  return list;
}
function chooserWantList(g) {
  const c = g.chooser;
  const level = g.chooserLevel ?? c?.level ?? 1;
  const b = g.board;
  const avail = new Set((c?.seeds || []).map((s) => s.seed));
  // Pool day (BG.POOL): same day book but the lily pad (16) leads — nothing
  // lily-needing plants on water without one. Sea-shroom (24) stays OUT by
  // day (nocturnal + day pool = sleeping; the bot carries no coffee), so the
  // day-pool filter never offers it even when unlocked. Fog (BG.FOG) is night
  // pool: the night book leads with lily, and the free sea-shroom joins as a
  // bare-water spammer where it is awake.
  // Day book is fixed (adventure day needs no counters); the avail filter
  // keeps test/staging banks honest — the live click path gates on presence
  // anyway.
  try {
    const bg = (b && b.bg) || backgroundForLevel(level);
    if (bg === BG.ROOF || bg === BG.BOSS) {
      // Roof day: sky sun, so the day economy — but straight shots die on
      // the slope, so only lobbed catapults (cabbage 32, kernel 34, melon
      // 39) count as guns. The pot (33) leads (every plant needs one);
      // pool-only/refused seeds stay out (tangle 19 and spikeweed 21 never
      // plant off-pool/ground; gravebuster 11 has no graves to clear on a
      // roof); nocturnals (8/9/10/12/13/24) sleep by day and plantern 25
      // has no fog to clear.
      const roster = levelRoster(b);
      const list = [];
      const push = (s) => { if ((avail.size === 0 || avail.has(s)) && !list.includes(s)) list.push(s); };
      push(33); push(32); push(34); push(39);
      push(1); push(3); push(2); push(4); push(17); push(6); push(20);
      if (roster.has("pole") || roster.has("pogo")) push(23);
      if (roster.has("balloon")) push(27);
      push(36);
      return list;
    }
    if (bg === BG.POOL) {
      return [16, ...CHOOSER_WANT].filter((s) => avail.size === 0 || avail.has(s));
    }
    if (bg === BG.FOG) {
      // Fog bank is 6 slots: lily leads (nothing lily-needing plants on
      // water without one), night-shroom economy, free puff line, wall,
      // plantern lamp, then blover when balloons walk (reactive whole-lawn
      // answer) else the free sea-shroom spammer. Slot upgrades append the
      // rest of the night book in priority order.
      const night = chooserWantNight(g, avail);
      const econ = avail.has(9) ? 9 : 1;
      const sixth = levelRoster(b).has("balloon") ? 27 : 24;
      const order = [16, econ, 8, 3, 25, sixth];
      for (const s of night) if (!order.includes(s)) order.push(s);
      return order.filter((s) => avail.size === 0 || avail.has(s));
    }
  } catch (e) { /* fall through to day/night books */ }
  if (!boardNight(b, level)) return CHOOSER_WANT.filter((s) => avail.size === 0 || avail.has(s));
  return chooserWantNight(g, avail);
}
function bank() { return G().bankSeeds || []; }
function bestShooter(b, avail = bank()) {
  // Opening barrels, no teeth yet: cheapest spammer the level offers. By
  // day that is the pea (snow/repeater come as earned second barrels); by
  // night the FREE puff-shroom must come first — the 50-sun start buys
  // economy, not guns. Fog/night pool adds the free sea-shroom (24) right
  // behind the puff — same 0-sun bare-water spammer, awake here (day pool
  // never reaches this branch, so no sleeping-sea leak by day). Stormy-night
  // belt (L40) guns — starfruit/split-pea/cactus — ride behind the night
  // order so the opening book finds barrels on a belt with no puff/pea/snow.
  const order = boardNight(b, b.level) ? [8, 24, 10, 13, 0, 5, 7, 29, 28, 26] : (isRoof(b) ? [...ROOF_GUNS] : SHOOTERS);
  for (const s of order) if (avail.includes(s) && b.canPickUpSeed(s)) return s;
  return -1;
}
// Which barrel the row wants next (-1 = nothing on hand). Day: snow is the
// dedicated second gun — a chill halves the whole row's walk speed, the
// highest-value barrel against anything bulky. Night: fume's pierce fills
// that utility slot, and the free puff is the spammer. Otherwise repeaters
// when the build can afford them (or the row is already committed), cheap
// peas for first barrels. Pool day adds threepeater (18) as the premium
// water gun — 3 lanes cover the 6-row pool, gated like the repeater so the
// 325 cost never starves the opening. Night/fog pool adds the free
// sea-shroom (24) behind the puff — bare-water short-range, awake here.
// Keys off the row's own guns and the sun reserve — never the level number.
function pickGun(b, r, avail = bank()) {
  let n = 0; const have = new Set();
  for (let c = 0; c < 9; c++) {
    const cell = b.cell(c, r);
    const p = cell && cell.base;
    if (!p || p.dead || p.sleeping || !isShooter(p.seed)) continue;
    n++; have.add(p.seed);
  }
  const night = boardNight(b, b.level);
  const roof = !night && isRoof(b);
  const util = night ? 10 : (roof ? -1 : 5); // no chill utility on roofs (snow is a banned gun there)
  if (n > 0 && util >= 0 && !have.has(util) && avail.includes(util) && b.canPickUpSeed(util)) return util;
  // L40 stormy-night belt guns (starfruit 29 / split-pea 28 / cactus 26) ride
  // behind the night order — the stormy belt holds no pea/snow/repeater, so
  // without these the row gun search returns -1 and the bot never plants guns.
  // Roofs take the catapult ladder instead (ROOF_GUNS).
  const order = night ? [8, 24, 10, 13, 0, 5, 7, 18, 29, 28, 26] : (roof ? [...ROOF_GUNS] : [7, 18, 5, 0, 29, 28, 26]);
  for (const s of order) {
    if (!avail.includes(s) || !b.canPickUpSeed(s)) continue;
    if (s === 7 && !(b.sun >= 350 || n > 0)) continue; // repeater only when rich/committed
    if (s === 18 && !(b.sun >= 400 || n > 0)) continue; // threepeater premium: 325 + lily tax needs a stockpile
    // Sleeping sea-shroom (day pool) never fires — the day book excludes it,
    // but a stale bank could still offer it: refuse it by day outright.
    if (s === 24 && !night) continue;
    return s;
  }
  return -1;
}
// Ticks until the lead reaches the door. Stalled chewers resume walking once
// they finish, so the pace floors at 0.15 — an eating zombie is a paused
// threat, not a solved one.
function doorWindow(b, lead) {
  return Math.max(0, (lead.x - 40) / Math.max(zPace(lead), 0.15));
}
// Armed potato mines answer the zombie walking into them: the 60px
// same-row blast (DoSpecial, flags 77) kills whatever eligible zombie
// triggers it plus whatever stands in the blast. Zombies an armed mine
// will kill need no gun — the lane is safe for them. (Arming mines cover
// nothing: contact chews them before the 1500t+139t arm completes.)
function mineCoveredIds(b, row) {
  const out = new Set();
  for (let c = 0; c < 9; c++) {
    const cell = b.cell(c, row);
    const p = cell && cell.base;
    if (!p || p.dead || p.seed !== 4 || p.state !== "armed") continue;
    const bx = p.x + 20, by = p.y + 40; // blast center (Plant.cpp:4416)
    const ax = p.x, aw = (p.w || 80) - 25; // attackRect(4): [x, x+w-25]
    const elig = [];
    for (const z of rowFoes(b, row)) {
      if (!z.hasHead) continue; // potato/chomper skip headless (4833)
      if (typeof z.effectedByDamage === "function" && !z.effectedByDamage(77)) continue;
      if (typeof z.zombieRect !== "function") continue;
      if (z.type === "pole" && (z.phase === "prevault" || z.phase === "invault" || z.vaultT > 0)) continue; // jumps clean over
      if (z.yucky > 0) continue; // garlic victim may leave the row
      if (zBulk(z) > 1800) continue; // survives the blast (garg): mine spent, nothing answered
      const zr = z.zombieRect();
      const extra = z.eating ? 30 : 0; // bite-range extension (4915)
      const overlap = Math.min(ax + aw, zr.x + zr.w) - Math.max(ax, zr.x);
      const arriving = (zPace(z) > 0 || z.butter > 0) && zr.x + zr.w > ax;
      if (overlap < -extra && !arriving) continue;
      elig.push({ z, x: zr.x });
    }
    if (!elig.length) continue;
    // First arrival detonates (leftmost, mirroring the bestX pick): it dies
    // on the line, plus whoever stands in the blast right now.
    const trigger = elig.reduce((m, e) => (e.x < m.x ? e : m), elig[0]);
    out.add(trigger.z.id);
    for (const e of elig) {
      const r2 = e.z.zombieRect();
      let dx = 0, dy = 0, xo = false, yo = false;
      if (bx < r2.x) { xo = true; dx = r2.x - bx; }
      else if (bx > r2.x + r2.w) { xo = true; dx = bx - r2.x - r2.w; }
      if (by < r2.y) { yo = true; dy = r2.y - by; }
      else if (by > r2.y + r2.h) { yo = true; dy = by - r2.y - r2.h; }
      const hit = (!xo && !yo) || (xo && yo ? dx * dx + dy * dy <= 3600 : xo ? dx <= 60 : dy <= 60);
      if (hit) out.add(e.z.id);
    }
  }
  return out;
}
// True while the row earns another barrel: none at all with teeth coming,
// otherwise until the guns on hand can chew the row's bulk before the lead
// reaches the door. Three barrels fill the gun columns; beyond that the
// answer is nuts and fire, not more peas.
function rowNeedsGun(b, r) {
  const covered = mineCoveredIds(b, r);
  const foes = rowFoes(b, r).filter((z) => !covered.has(z.id));
  if (!foes.length) return false; // guns and mines answer everything walking
  const n = rowShooters(b, r);
  if (n === 0) return true;
  if (n >= 3) return false;
  const lead = foes.reduce((m, z) => (z.x < m.x ? z : m), foes[0]);
  const bulk = foes.reduce((sum, z) => sum + zBulk(z), 0);
  return rowKillPower(b, r, doorWindow(b, lead)) < bulk * 1.2;
}
function sunTarget(b, rows) {
  if (b.level <= 2) return 3;
  // Humans run two sunflower columns. The build earns it dynamically: while
  // no row is pressured the bot keeps planting into the back columns (up to
  // a full second column), and stops itself the moment teeth show. Capped by
  // back-column space (2 per playable row) so dirt-row levels can't starve
  // the guns chasing an unreachable number.
  if (rows.every((r) => rowPressure(b, r) <= 0.05)) return Math.min(10, 2 * rows.length);
  return 5;
}
// Sun economy counting both producers (sunflower by day, sun-shroom by night).
function sunCount(b) { return countSeed(b, 1) + countSeed(b, 9); }

// Placement-first pickup: a seed is only worth lifting when the cell it
// would go to is already known — cellForSeed finds one right now, it isn't
// fail-banned, and it passes canPlant (the exact gate plantAt enforces).
// Every branch below proves its placement before returning, and actBoard
// re-proves it again just before the hand moves, so the bot never lifts a
// packet for a placement that wouldn't work anyway.
function rawPlaceable(b, seed, rows) { // tutorial scripts: ignore fail-memory
  let cell = null;
  try { cell = cellForSeed(b, seed, rows); } catch (e) { return null; }
  if (!cell) return null;
  try { if (!b.canPlant(cell.c, cell.r, seed)) return null; } catch (e) { return null; }
  return cell;
}
function placeableCell(b, seed, rows) {
  if (seedBanned(seed)) return null; // recently failed: reconsider others first
  let cell = null;
  try { cell = cellForSeed(b, seed, rows); } catch (e) { return null; }
  if (!cell) return null;
  if (isPlaceBanned(seed, cell)) return null;
  try { if (!b.canPlant(cell.c, cell.r, seed)) return null; } catch (e) { return null; }
  return cell;
}
// Decide the next pickup (or -1). Pure choice; the click happens in act().
// `avail` defaults to the fixed bank; the conveyor passes its present
// packet seeds so the same priorities pick the right packet. Order is
// need-first: cherry, then the early solo mine, guns, blockers, the late
// supplemental mine, gulpers, and only then the economy filler — defense
// never starves while teeth are on the lawn.
function decidePickup(b, rows, avail = bank()) {
  const ready = (s) => avail.includes(s) && b.canPickUpSeed(s);
  const has = (s) => ready(s) && !seedBanned(s); // recently-failed seeds sit out briefly
  const tut = b.tutorialState;
  const l1Tut = tut >= TUT.L1_PICK_UP_PEASHOOTER && tut <= TUT.L1_REFRESH_PEASHOOTER;
  const l2Tut = tut >= TUT.L2_PICK_UP_SUNFLOWER && tut <= TUT.L2_REFRESH_SUNFLOWER;
  // L1 tutorial: Dave wants TWO peashooters before the first wave releases
  // (plantAt COMPLETES at allPlants >= 2). The opening book below caps L1 at
  // one shooter and would wait forever for a wave the tutorial never sends,
  // so force the pea whenever it is pickable (recharge waits itself out).
  // Tutorial force-picks bypass the fail bans (scripted sequence, not choice).
  if (l1Tut && ready(0)) { if (!rawPlaceable(b, 0, rows)) return -1; return 0; }
  // L2 tutorial: three sunflowers before anything else, like a human
  // following the prompts (COMPLETES at 3 regardless of other plants).
  if (l2Tut && countSeed(b, 1) < 3 && ready(1)) { if (!rawPlaceable(b, 1, rows)) return -1; return 1; }
  // Roof: every plant but the pot needs a pot underneath — plant the pot
  // at the highest-priority wanted cell before anything else (the branches
  // below all fail canPlant on pot-less roof cells, so without this the
  // bot would idle while the pot sits in the bank).
  if (isRoof(b) && has(33)) { try { if (roofPotCell(b, rows)) return 33; } catch (e) { /* fall through to branches */ } }
  // Emergency cherry: an instant kill is for emergencies — a rich clump of
  // walked-in zombies or a last-resort save at the door. Lanes with no
  // lawnmower claim it first (no second chance there); see cherryTarget.
  if (has(2)) {
    if (placeableCell(b, 2, rows)) return 2;
    // Pool: the blast wants bare water — lily first, cherry next think.
    if (has(16) && lilyInstead(b, 2, rows)) return 16;
  }
  // Hypno-shroom: the instant single-target converter — a lone high-hp
  // walker eats the 75-sun shroom and turns, clearing its row for us.
  // Priority sits with the cherry (picked and planted immediately, ahead of
  // mines/guns/economy) since the target is already chosen and waiting.
  if (has(12)) {
    if (placeableCell(b, 12, rows)) return 12;
    // Pool: the convert wants bare water — lily first, hypno next think.
    if (has(16) && lilyInstead(b, 12, rows)) return 16;
  }
  // Blover (27): the whole-lawn balloon answer — one blow clears every
  // flying balloon board-wide (BlowAwayFliers, all rows) plus the fog
  // (fogBlown 4000). Plants reactively when a VISIBLE flyer is on the lawn
  // (x<600) and no live blover is already up — a second blover while one
  // is armed is wasted sun. Above tangle/squash: it answers the flying
  // threat nothing else touches.
  if (has(27)) {
    let flyer = false;
    for (const z of b.zombies) {
      if (z.dead || z.gone || z.mowed || z.houseWalk || z.ally || (z.type === "bungee" && !z.bungeeOnLawn())) continue;
      if (!(z.phase === "flying" || z.flying) || z.blowingAway) continue;
      if (z.x >= 600) continue; // still mustering offscreen: wait
      if (!foeVisible(z, b)) continue; // hidden in fog: doesn't exist yet
      flyer = true; break;
    }
    const bloverUp = b.allPlants().some((p) => !p.dead && p.seed === 27);
    if (flyer && !bloverUp && placeableCell(b, 27, rows)) return 27;
  }
  // Tangle Kelp (19): the water instant — 25-sun single-use, no arming, bare
  // water only (lily blocks it, so no lily diversion). Answers water scouts
  // early and water bulkies late without the 125-sun lily+pea tax. Priority
  // sits with cherry/hypno (clump/convert) and ahead of mines/guns — the
  // target is already chosen and waiting.
  if (has(19)) {
    if (placeableCell(b, 19, rows)) return 19;
  }
  // Squash (17): the cheap door-save — 50-sun leap (1800dmg), back-column
  // placement so it never gets eaten on the way in. Lily-needing on water,
  // plain ground on land. Below tangle (water-specific) and above mines —
  // an instant is an instant, and squash is half the cherry's price.
  if (has(17)) {
    if (placeableCell(b, 17, rows)) return 17;
    if (has(16) && lilyInstead(b, 17, rows)) return 16;
  }
  // Early game: a 25-sun mine answers a lone scout solo — the classic opener
  // — while every other sun grows the economy (no saving 100 for a pea that
  // arrives after the bite). Single-target only (cap + right-half placement
  // live in potatoCell); hordes fall through to the guns below. Skipped when
  // a free awake barrel is on hand — free guns beat a 25-sun mine (sea-shroom
  // only counts by night: by day it sleeps and defends nothing).
  // (Late-game mines stay below, after the blockers, as supplements.)
  const early = earlyGame(b);
  const freeBarrel = has(8) && placeableCell(b, 8, rows);
  const freeSea = boardNight(b, b.level) && has(24) && placeableCell(b, 24, rows);
  if (early && has(4) && !(freeBarrel || freeSea)) {
    if (placeableCell(b, 4, rows)) return 4;
    if (has(16) && lilyInstead(b, 4, rows)) return 16;
  }
// Plantern (25): the fog lamp — clears a size-4 diamond (Board::
// ClearFogAroundPlant) so the guns can hit what walks in, and so the
// bot itself can see the right side again. Two lamps cover the lawn
// (planternCell scores fog-side land cells by the dense fog their diamond
// covers); more than two is wasted sun. Land only — never a lily tax for
// a lamp. Skipped while no cell covers real fog (thin early roll needs no
// lamp). Above guns: vision first, then barrels into the lit lanes.
  if (has(25) && isFog(b)) {
    if (placeableCell(b, 25, rows)) return 25;
  }
  // Shooters into the highest-pressure row (deferred during the L2
  // sunflower tutorial until the third sunflower is down). Depth is earned,
  // not scheduled: barrels keep coming while the row's guns can't chew its
  // bulk before the lead reaches the door — that rule grows the human
  // two-pea-plus-snow lanes against buckets and stays lean against scouts.
  const wr = weakestRow(b, rows);
  // The pressure gate alone would starve rows whose first gun already answers
  // the raw threat number — rowNeedsGun re-opens those rows while their guns
  // can't chew the observed bulk (and opens fresh rows at first sight, the
  // way humans plant a pea for the first scout).
  if (!(l2Tut && countSeed(b, 1) < 3) && (rowPressure(b, wr) > 0.05 || rowNeedsGun(b, wr))) {
    // The barrel must be placeable right now, not just affordable: try the
    // wanted barrel first, then the next pickGun choice, so a banned or
    // unplantable top pick falls through instead of spinning pickup/cancel.
    // Per-seed lily check (not a 0-proxy): bare-water guns (sea-shroom) need
    // NO lily — planting one for them would block the very cell they want.
    if (rowNeedsGun(b, wr)) {
      let rest = [...avail];
      for (;;) {
        const s = pickGun(b, wr, rest);
        if (s < 0) break;
        rest = rest.filter((x) => x !== s);
        if (seedBanned(s)) continue;
        if (placeableCell(b, s, rows)) return s;
        if (has(16) && lilyInstead(b, s, rows)) return 16;
      }
    }
  }
  // Blockers: stall what the row's guns can't chew through in time. Tall-nut
  // for vaulting poles when one is on hand (it blocks the vault cold) and
  // the heaviest pushes (bucket/door/football bulk); wall-nut for everything
  // else bulky — including vault rows, where the jump itself buys firing
  // time. Skip rows a smasher is already crushing: no plant survives that,
  // use fire.
  {
    const canTall = has(23);
    const canWall = has(3);
    if (canTall || canWall) {
      const order = [...rows].sort((a, c) => rowPressure(b, c) - rowPressure(b, a));
      for (const r of order) {
        // A jumped wall-nut is no wall: vault-threat rows with only a wall
        // still need a tall-nut, so only solid rows are skipped.
        if (rowNutCredit(b, r) >= 1) continue;
        const foes = rowFoes(b, r).filter((z) => zPace(z) > 0 || z.eating);
        if (!foes.length) continue;
        const lead = foes.reduce((m, z) => (z.x < m.x ? z : m), foes[0]);
        if (lead.x > 560 && !foes.some((z) => z.eating)) continue; // nothing pressing yet
        if (["boss", "garg", "zamboni", "catapult"].includes(lead.type)) continue;
        // Vaulters jump wall-nuts, so tall-nut (or nothing, if no tall is on
        // hand) used to be the rule — but the jump itself costs ~180t of
        // vault plus the slow trudge after, which is real firing time for
        // the guns behind it. Plant the wall anyway: a jumped wall still
        // buys the row time, and time is what kills poles.
        // Each candidate is placement-proved: an unplantable top pick falls
        // through to the next seed (or the next row) instead of a wasted
        // pickup.
        if (foes.some(isVaultThreat)) {
          for (const cand of [canTall ? 23 : -1, canWall ? 3 : -1]) {
            if (cand >= 0 && placeableCell(b, cand, rows)) return cand;
            if (cand >= 0 && has(16) && lilyInstead(b, cand, rows)) return 16;
          }
          continue;
        }
        if (zBulk(lead) >= 450 || foes.some((z) => z.eating)) {
          const primary = (canTall && zBulk(lead) >= 1200) ? 23 : (canWall ? 3 : 23);
          const secondary = primary === 23 ? (canWall ? 3 : -1) : (canTall ? 23 : -1);
          for (const cand of [primary, secondary]) {
            if (cand >= 0 && placeableCell(b, cand, rows)) return cand;
            if (cand >= 0 && has(16) && lilyInstead(b, cand, rows)) return 16;
          }
        }
      }
    }
  }
  // Cactus (26): the per-row balloon answer — rises to HIGH spikes (20dmg
  // flying pool) when the flyer is in range, pops it (20 flying HP), then
  // lowers again. LOW spikes still chew ground (20dmg SECONDARY), so it
  // doubles as the row gun wherever it stands. One per row, only where a
  // VISIBLE flyer walks (x<600, not already blown); blown balloons drift
  // off on their own and need nothing.
  if (has(26)) {
    const order = [...rows].sort((a, c) => rowPressure(b, c) - rowPressure(b, a));
    for (const r of order) {
      const flyers = rowFoes(b, r).filter((z) => (z.phase === "flying" || z.flying) && !z.blowingAway && z.x < 600);
      if (!flyers.length) continue; // rowFoes already hides fogged zombies
      if (rowHasSeed(b, r, 26)) continue; // one cactus per row
      if (placeableCell(b, 26, [r])) return 26;
      if (has(16) && lilyInstead(b, 26, [r])) return 16;
    }
  }
  // Potato mine late: supplemental front-line mines behind the blockers
  // pick. (Early-game mines branch above, before the shooters, as solo
  // single-target openers.)
  if (!early && has(4)) {
    if (placeableCell(b, 4, rows)) return 4;
    if (has(16) && lilyInstead(b, 4, rows)) return 16;
  }
  // Chomper: the close-range answer potato can't give. A 70t fuse gulps
  // whatever reaches the wall (or whatever is about to reach the door when
  // no wall is up and no mine can arm in time) — one zombie per 4000t
  // digest, so one gulper per row at a time.
  if (has(6)) {
    if (placeableCell(b, 6, rows)) return 6;
    if (has(16) && lilyInstead(b, 6, rows)) return 16;
  }
  // Gravebuster: once the row's guns/nuts hold, clear standing stones. Each
  // stone spawns grave-rise zombies behind the line on later waves and eats
  // a plantable cell, so clearing compounds — but defense and the first
  // economy come first (has() already sun-gates the 75 cost).
  if (has(11) && b.hasGraves()) {
    if (placeableCell(b, 11, rows)) return 11;
  }
  // Economy filler: with every defensive need above satisfied, grow suns to
  // target. Night runs the sun-shroom (no sky sun falls at night — the
  // shroom IS the economy); day runs the sunflower. Guns and blockers go
  // first while teeth are near, and the build resumes the moment the rows
  // are covered — the on-off cycle that grows the two-column economy without
  // ever starving defense. (Ablation result: holding back sun for a cherry
  // reserve starved the build and lost games — the economy that funds
  // cherries matters more than banking for one.)
  {
    const night = boardNight(b, b.level);
    const econ = night ? (has(9) ? 9 : 1) : 1;
    if (has(econ) && sunCount(b) < sunTarget(b, rows) && placeableCell(b, econ, rows)) return econ;
    if (has(econ) && sunCount(b) < sunTarget(b, rows) && has(16) && lilyInstead(b, econ, rows)) return 16;
  }
  // Opening book: no zombies yet — a pea per two rows max so the first
  // scouts meet barrels (shooters still deferred while L2 wants sunflowers).
  // Fog-of-war: zombies hidden in dense fog don't count — the opening
  // keeps building until something VISIBLE walks in.
  if (!b.zombies.some((z) => !z.dead && !z.gone && foeVisible(z, b)) && !(l2Tut && countSeed(b, 1) < 3)) {
    let shooters = 0;
    for (const p of b.allPlants()) if (!p.dead && !p.sleeping && isShooter(p.seed)) shooters++;
    if (shooters < Math.ceil(rows.length / 2)) {
      let rest = [...avail];
      for (;;) {
        const s = bestShooter(b, rest);
        if (s < 0) break;
        rest = rest.filter((x) => x !== s);
        if (seedBanned(s)) continue;
        if (placeableCell(b, s, rows)) return s;
        // Pool: opening water barrels on bare water wait on their lily —
        // per-seed, so bare-water openers (sea) never eat a blocking lily.
        if (has(16) && lilyInstead(b, s, rows)) return 16;
      }
    }
  }
  return -1;
}
// Placement: every plant type wants a different spot relative to the teeth.
// Zombies chew right-to-left, so fragile plants live LEFT (low columns, safe
// rows) and blockers live RIGHT (between the guns and the horde). A plant is
// never placed in a cell the horde has already passed (center right of the
// lead zombie) — zombies never walk back.
// Potato-mine columns (0-indexed): the right half of the 9-wide lawn, i.e.
// human columns 5-9. Mines never go left of this — and no other persistent
// plant ever goes IN FRONT OF (right of) a live mine in the same row: a
// plant between the mine and the horde makes zombies stop to chew it, so
// the mine never gets contacted ("blocking it in"). mineCol returns the
// live mine's column in a row, -1 when the row has none.
const POTATO_MIN_COL = 4;
function mineCol(b, r) {
  for (let c = 0; c < 9; c++) {
    const cell = b.cell(c, r);
    const p = cell && cell.base;
    if (p && !p.dead && p.seed === 4) return c;
  }
  return -1;
}
function cellRightX(b, c) { return lawnXMin(b.bg) + c * cellW(b.bg) + 50; } // bite-contact line, mid-plant
function cellEmpty(b, c, r) {
  const cell = b.cell(c, r);
  // Grave cells plant nothing but a gravebuster (Board::CanPlantAt
  // PLANTING_NOT_ON_GRAVE) — every generic placement dodges them.
  if (!cell || cell.crater || cell.grave) return false;
  return (!cell.base || cell.base.dead) && !b.isDirtRow(r);
}
// ---- pool: lily pad first ----
// Board::CanPlantAt pool branch (sim.js canPlant): the lily (16) goes on
// empty water; EVERYTHING else needs a live lily underneath. The finders
// above stay lily-ignorant on purpose — they return the cell the strategy
// wants, placeableCell (canPlant) rejects pool tiles without a lily, and
// the lily branch in decidePickup plants the missing lily at that exact
// cell first. These helpers are the demand signal for that branch.
function isPoolTile(b, r) {
  try { return typeof b.isWaterRow === "function" && b.isWaterRow(r); }
  catch (e) { return false; }
}
function hasLiveLily(b, c, r) {
  const cell = b.cell(c, r);
  return !!(cell && cell.lily && !cell.lily.dead);
}
function lilyNeededAt(b, c, r) {
  if (!isPoolTile(b, r)) return false;
  const cell = b.cell(c, r);
  if (!cell || cell.crater) return false;
  if (cell.base && !cell.base.dead) return false; // already planted: no lily needed
  return !hasLiveLily(b, c, r);
}
function lilyAtPlaceable(b, cell) {
  if (!cell) return false;
  if (seedBanned(16)) return false;
  if (isPlaceBanned(16, cell)) return false;
  try { return b.canPlant(cell.c, cell.r, 16); } catch (e) { return false; }
}
// Raw cell this seed wants right now (ignores canPlant) when that cell sits
// on bare water and a lily fits there — the "plant the lily first" diversion
// each decidePickup branch checks before giving up on its seed.
function lilyInstead(b, seed, rows) {
  if (seed === 16) return null;
  // Tangle kelp (19) and sea-shroom (24) plant in BARE water — a lily blocks
  // them (Board::CanPlantAt pool branch: NO underplant). Never divert to a
  // lily for them; their cells are usable as-is.
  if (seed === 19 || seed === 24) return null;
  let raw = null;
  try { raw = cellForSeed(b, seed, rows); } catch (e) { return null; }
  if (raw && lilyNeededAt(b, raw.c, raw.r) && lilyAtPlaceable(b, raw)) return raw;
  return null;
}
// The pool tile the strategy wants next that still lacks its lily — probed
// in decidePickup priority order so the lily lands exactly where the
// blocked plant wants to go (cherry blast, gun row, wall, gulper, squash,
// economy). Tangle/sea need bare water (no lily) and potato stays on land,
// so none of them are probed here. Null when no wanted placement is
// pool-blocked.
function poolLilyCell(b, rows) {
  const waters = rows.filter((r) => isPoolTile(b, r));
  if (!waters.length) return null;
  const probe = (cell) => (cell && lilyNeededAt(b, cell.c, cell.r) ? cell : null);
  try { const ch = probe(cherryTarget(b, rows)); if (ch) return ch; } catch (e) { /* no cherry want */ }
  try { const hy = probe(hypnoCell(b, rows)); if (hy) return hy; } catch (e) { /* no hypno want */ }
  try { const sq = probe(squashCell(b, rows)); if (sq) return sq; } catch (e) { /* no squash want */ }
  try { const sc = probe(shooterCell(b, rows)); if (sc) return sc; } catch (e) { /* no gun want */ }
  try { const nt = probe(nutCell(b, 23, rows)) || probe(nutCell(b, 3, rows)); if (nt) return nt; } catch (e) { /* no wall want */ }
  try { const cc = probe(chomperCell(b, rows)); if (cc) return cc; } catch (e) { /* no gulper want */ }
  try { const ec = probe(sunflowerCell(b, rows)); if (ec) return ec; } catch (e) { /* no economy want */ }
  return null;
}
// ---- roof: flower pot first ----
// Board::CanPlantAt roof branch (sim.js canPlant): everything but the pot
// (33) needs a live pot underneath. Mirrors the pool lily system: potNeededAt
// rejects roof cells without a pot, and roofPotCell probes the strategy's
// wanted cells in decidePickup priority order so the pot lands exactly where
// the blocked plant wants to be.
function isRoof(b) { try { return !!(b && (b.bg === BG.ROOF || b.bg === BG.BOSS)); } catch (e) { return false; } }
function hasLivePot(b, c, r) {
  const cell = b.cell(c, r);
  return !!(cell && cell.pot && !cell.pot.dead);
}
function potNeededAt(b, c, r) {
  if (!isRoof(b)) return false;
  const cell = b.cell(c, r);
  if (!cell || cell.crater) return false;
  const base = cell.base;
  if (base && !base.dead) return false; // planted (a live base implies its pot)
  return !hasLivePot(b, c, r);
}
function potAtPlaceable(b, cell) {
  if (!cell) return false;
  if (seedBanned(33)) return false;
  if (isPlaceBanned(33, cell)) return false;
  try { return b.canPlant(cell.c, cell.r, 33); } catch (e) { return false; }
}
// The roof tile the strategy wants next that still lacks its pot — probed
// in decidePickup priority order (cherry, hypno, squash, guns, walls,
// chomper, potato, blover, economy) like poolLilyCell. Tangle/sea are
// pool-only and graves never grow on roofs, so none of them are probed.
function roofPotCell(b, rows) {
  if (!isRoof(b)) return null;
  const probe = (cell) => (cell && potNeededAt(b, cell.c, cell.r) && potAtPlaceable(b, cell) ? cell : null);
  try { const ch = probe(cherryTarget(b, rows)); if (ch) return ch; } catch (e) { /* no cherry want */ }
  try { const hy = probe(hypnoCell(b, rows)); if (hy) return hy; } catch (e) { /* no hypno want */ }
  try { const sq = probe(squashCell(b, rows)); if (sq) return sq; } catch (e) { /* no squash want */ }
  try { const sc = probe(shooterCell(b, rows)); if (sc) return sc; } catch (e) { /* no gun want */ }
  try { const nt = probe(nutCell(b, 23, rows)) || probe(nutCell(b, 3, rows)); if (nt) return nt; } catch (e) { /* no wall want */ }
  try { const cc = probe(chomperCell(b, rows)); if (cc) return cc; } catch (e) { /* no gulper want */ }
  try { const pm = probe(potatoCell(b, rows)); if (pm) return pm; } catch (e) { /* no mine want */ }
  try { const bv = probe(bloverCell(b, rows)); if (bv) return bv; } catch (e) { /* no blower want */ }
  try { const ec = probe(sunflowerCell(b, rows)); if (ec) return ec; } catch (e) { /* no economy want */ }
  return null;
}
// Gravebuster placement: leftmost standing stone on the most-pressured row
// first (clears planting space where the fight is), else leftmost anywhere.
function graveCell(b, rows) {
  const order = [...rows].sort((a, c) => rowPressure(b, c) - rowPressure(b, a));
  for (const r of order) {
    const m = mineCol(b, r);
    for (let c = 0; c < 9; c++) {
      if (m >= 0 && c > m) continue; // gravebuster is a plant: don't block a mine in
      const cell = b.cell(c, r);
      if (cell && cell.grave && (!cell.base || cell.base.dead)) return { c, r };
    }
  }
  return null;
}
function minContactTime(b, row, c) { // soonest any chewer reaches this cell (Infinity = safe)
  let m = Infinity;
  for (const z of rowFoes(b, row)) {
    if (!zCanChew(z)) continue;
    m = Math.min(m, timeToCellX(b, z, cellRightX(b, c)));
  }
  return m;
}
function sunflowerCell(b, rows) { // economy hides: safest rows, back columns
  // Pool: sunflowers stay on LAND — a water sunflower costs lily+flower
  // (25+50) for the same sun, so land rows earn the economy first and water
  // rows stay open for tangle/sea/guns. Falls back to water only when land
  // is full (all land back cells taken).
  const lands = rows.filter((r) => !isPoolTile(b, r));
  const use = lands.length ? lands : rows;
  const safe = [...use].sort((a, c) => rowPressure(b, a) - rowPressure(b, c));
  return emptyCell(b, [0, 1], safe, { avoidMine: true }) || emptyCell(b, [0, 1], use, { avoidMine: true });
}
function shooterCell(b, rows) { // guns stay behind the line: protected cols first, only forward in desperation
  const r = weakestRow(b, rows);
  for (const c of [2, 1, 0]) {
    if (cellEmpty(b, c, r) && minContactTime(b, r, c) > 600) return { c, r }; // ~6s+ of firing before contact
  }
  const m = mineCol(b, r);
  let best = null, bt = -1; // emergency: most lead time anywhere left of the pack
  for (let c = 0; c < 9; c++) {
    if (m >= 0 && c > m) continue; // guns never sit in front of a live mine
    if (!cellEmpty(b, c, r)) continue;
    const t = minContactTime(b, r, c);
    if (t > bt) { best = c; bt = t; }
  }
  if (best !== null) return { c: best, r };
  return emptyCell(b, [2, 1, 0, 5, 6], rows, { avoidMine: true });
}
function nutCell(b, seed, rows) { // the wall goes in harm's way: rightmost empty cell still left of the lead zombie
  const order = [...rows].sort((a, c) => rowPressure(b, c) - rowPressure(b, a));
  for (const r of order) {
    if (rowNuts(b, r)) continue;
    const foes = rowFoes(b, r).filter((z) => zPace(z) > 0 || z.eating);
    if (!foes.length) continue;
    const lead = foes.reduce((m, z) => (z.x < m.x ? z : m), foes[0]);
    // Vaulters jump wall-nuts — but only when a tall-nut is actually on hand
    // to block the vault instead. Otherwise the wall goes down anyway: the
    // jump wastes the pole's time while the guns work (see decidePickup).
    if (seed !== 23 && foes.some(isVaultThreat) && bank().includes(23)) continue;
    if (["boss", "garg", "zamboni", "catapult"].includes(lead.type)) continue; // crushes any plant: save the sun
    const m = mineCol(b, r);
    for (let c = 8; c >= 0; c--) {
      if (m >= 0 && c > m) continue; // the wall backs the mine up, never covers it
      if (!cellEmpty(b, c, r)) continue;
      if (gridToPixelX(c, b.bg) + 41 < lead.x - 30) return { c, r };
    }
  }
  return emptyCell(b, [4, 5, 3], rows, { avoidMine: true });
}
function rowKillPower(b, row, window) { // damage the row's guns deal in `window` ticks
  let barrels = 0;
  for (let c = 0; c < 9; c++) {
    const cell = b.cell(c, row);
    const p = cell && cell.base;
    if (!p || p.dead || p.sleeping || !isShooter(p.seed)) continue;
    barrels += p.seed === 7 ? 2 : 1; // repeater fires twice per volley
  }
  if (!barrels || !(window > 0)) return 0;
  return barrels * 20 * (window / 150); // 20dmg peas, ~150t volleys (conservative)
}
function potatoCell(b, rows) { // traps on the right half (cols 4-8): only where a zombie will walk AND the mine arms first
  // A potato needs 1500t countdown + ~139t rise (25-frame anim_rise @18fps),
  // so the bar is 1700t. Early game the mine is the single-target answer —
  // one mine per scout row (two walkers / 1300 bulk at most) while every
  // other sun grows the economy. Late game it supplements the line: ahead
  // of the frontmost plant first, then the rest of the right half. Two
  // guards in both modes: no blind openers (a row with no zombies has
  // nothing to catch) and no redundancies (guns that finish the row first
  // keep the sun). Vaulters are skipped (they jump potatoes without
  // detonating, Plant.cpp:4895-4917); garlic victims mid-divert make the
  // row uncertain.
  const NEED = 1700;
  const early = earlyGame(b);
  const order = [...rows].sort((a, c) => rowPressure(b, c) - rowPressure(b, a));
  for (const r of order) {
    // Pool water rows belong to the tangle kelp (19): potato mines stay on
    // land. (Retail ONLY_ON_GROUND; this port's sim currently allows lily
    // potatoes, but the bot plays retail — water answers are tangle/sea.)
    if (isPoolTile(b, r)) continue;
    // One mine per row: an armed mine already answers the next zombie that
    // walks in (its proximity blast handles chewers too), and an arming one
    // will — a second mine in the same row is pure backup, never value.
    if (mineCol(b, r) >= 0) continue;
    const foes = rowFoes(b, r);
    if (!foes.length) continue; // nothing coming down this row: no blind mines
    if (foes.some(isVaultThreat)) continue; // jumped: wasted potato
    if (foes.some((z) => z.yucky > 0)) continue; // garlic victim may leave the row
    const lead = foes.reduce((m, z) => (z.x < m.x ? z : m), foes[0]);
    const bulk = foes.reduce((s, z) => s + zBulk(z), 0);
    // Single-target discipline early: a mine trades for one scout or two —
    // hordes and heavies still earn guns, and the sun keeps building.
    if (early && (foes.length > 2 || bulk > 1300)) continue;
    const leadX = lead.x;
    // Ahead of the front line first (the mine backs up the plants while they
    // fight), then the rest of the right half. A bare row sweeps
    // rightmost-first.
    const front = frontPlantCol(b, r);
    const cols = [];
    if (front >= 0) {
      for (let c = front + 1; c <= 8; c++) cols.push(c);
      for (let c = front - 1; c >= POTATO_MIN_COL; c--) cols.push(c);
    } else for (let c = 8; c >= POTATO_MIN_COL; c--) cols.push(c);
    for (const c of cols) {
      if (!cellEmpty(b, c, r)) continue;
      if (gridToPixelX(c, b.bg) + 41 > leadX) continue; // never behind the horde
      const t = minContactTime(b, r, c);
      if (t < NEED) continue; // won't arm in time
      if (rowKillPower(b, r, t) > bulk * 1.2) continue; // guns finish the row first: save the sun
      return { c, r };
    }
  }
  return null;
}
// Defense not yet built: fewer than two guns/walls/gulpers on the lawn —
// mines answer the scouts solo while the sun builds (early game).
function earlyGame(b) {
  let fighters = 0;
  for (const p of b.allPlants()) {
    if (p.dead || p.sleeping) continue;
    const s = p.seed;
    if (isShooter(s) || s === 3 || s === 23 || s === 6) { if (++fighters >= 2) return false; }
  }
  return true;
}
function frontPlantCol(b, r) { // rightmost live non-mine plant, -1 on a bare row
  let f = -1;
  for (let c = 0; c < 9; c++) {
    const cell = b.cell(c, r);
    const p = cell && cell.base;
    if (!p || p.dead || p.seed === 4) continue;
    f = c;
  }
  return f;
}
// ---- pool water instants: tangle kelp (19) + sea-shroom (24) + squash (17) ----
// Tangle/sea plant in BARE water (Board::CanPlantAt pool branch: no lily,
// lily blocks them). bareWaterEmpty is the pool twin of cellEmpty.
function bareWaterEmpty(b, c, r) {
  if (!isPoolTile(b, r)) return false;
  const cell = b.cell(c, r);
  if (!cell || cell.crater) return false;
  if (cell.grave) return false;
  return (!cell.base || cell.base.dead) && (!cell.lily || cell.lily.dead);
}
function tangleCol(b, r) { // live tangle in the row, -1 when none (one at a time: it dies on its kill)
  for (let c = 0; c < 9; c++) {
    const cell = b.cell(c, r);
    const p = cell && cell.base;
    if (p && !p.dead && p.seed === 19) return c;
  }
  return -1;
}
// Tangle Kelp: the water potato — 25-sun single-use, no arming delay (100t
// drag), so it answers water scouts early and water bulkies late without the
// lily+pea tax. Targets headed non-flying swimmers only (FindTargetZombie
// skips headless; flags 5 skip flyers; inPool gate); vault rows skipped (the
// pole jumps the kelp like a potato); garlic-divert rows uncertain;
// garg/boss bulk (>1800) and crushers (zamboni/catapult) save their sun.
function tangleTarget(b, rows) {
  const waters = rows.filter((r) => isPoolTile(b, r));
  if (!waters.length) return null;
  const early = earlyGame(b);
  const order = [...waters].sort((a, c) => rowPressure(b, c) - rowPressure(b, a));
  for (const r of order) {
    if (tangleCol(b, r) >= 0) continue; // one kelp per row: idle grabs the next, grabbing kills it
    const foes = rowFoes(b, r).filter((z) => {
      if (!z.hasHead) return false; // tangle skips headless (Plant.cpp: FindTargetZombie gate)
      if (z.flying || z.type === "balloon") return false; // flags 5 have no flying bit
      if (typeof z.isTangleKelpTarget === "function" && z.isTangleKelpTarget()) return false; // already grabbed: dying
      return true;
    });
    if (!foes.length) continue;
    if (foes.some(isVaultThreat)) continue; // jumped like a potato
    if (foes.some((z) => z.yucky > 0)) continue; // garlic victim may leave the row
    const lead = foes.reduce((m, z) => (z.x < m.x ? z : m), foes[0]);
    if (["boss", "garg", "zamboni", "catapult"].includes(lead.type)) continue; // crushed or too big: save the sun
    const bulk = foes.reduce((s, z) => s + zBulk(z), 0);
    if (bulk > 1800) continue; // garg/boss class: tangle spent, nothing answered
    if (early && (foes.length > 2 || bulk > 1300)) continue; // single-target discipline early, like the potato
    if (rowKillPower(b, r, doorWindow(b, lead)) > bulk * 1.2) continue; // guns chew it before the door: save the sun
    const leadX = lead.x;
    const leadCol = Math.max(0, Math.min(8, Math.floor((leadX - lawnXMin(b.bg)) / cellW(b.bg))));
    for (let c = leadCol; c >= 0; c--) {
      if (!bareWaterEmpty(b, c, r)) continue;
      if (gridToPixelX(c, b.bg) + 41 > leadX) continue; // never behind the horde
      return { c, r };
    }
  }
  return null;
}
function tangleCell(b, rows) { return tangleTarget(b, rows); }
// Sea-shroom: the night-pool puff — 0-sun bare-water short-range (60/230
// attack rect, PUFF motion), awake only when boardNight (fog/night pool).
// Placement mirrors the puff line (protected back columns first), but on bare
// water. Day pool never reaches here (pickGun refuses 24 by day).
function seaCell(b, rows) {
  if (!boardNight(b, b.level)) return null;
  const waters = rows.filter((r) => isPoolTile(b, r));
  if (!waters.length) return null;
  const r = weakestRow(b, waters);
  for (const c of [2, 1, 0]) {
    if (bareWaterEmpty(b, c, r) && minContactTime(b, r, c) > 600) return { c, r };
  }
  let best = null, bt = -1;
  for (let c = 0; c < 9; c++) {
    if (!bareWaterEmpty(b, c, r)) continue;
    const t = minContactTime(b, r, c);
    if (t > bt) { best = c; bt = t; }
  }
  if (best !== null) return { c: best, r };
  for (const rr of waters) {
    for (const c of [2, 1, 0]) if (bareWaterEmpty(b, c, rr)) return { c, r: rr };
  }
  return null;
}
// Squash: the cheap door-save (50 sun, leaps to its victim, 1800dmg). Sits
// in the pressured row behind the line and leaps forward — so back-column
// placement is safe (never eaten on the way in). Lily-needing on water
// (via lilyInstead), plain ground on land. Skips crushers and rows the guns
// already finish.
function squashCell(b, rows) {
  const order = [...rows].sort((a, c) => rowPressure(b, c) - rowPressure(b, a));
  for (const r of order) {
    const foes = rowFoes(b, r).filter((z) => zPace(z) > 0 || z.eating);
    if (!foes.length) continue;
    const lead = foes.reduce((m, z) => (z.x < m.x ? z : m), foes[0]);
    if (lead.x > 350) continue; // only close pressure earns the instant
    if (["boss", "garg", "zamboni", "catapult"].includes(lead.type)) continue;
    const bulk = foes.reduce((s, z) => s + zBulk(z), 0);
    if (rowKillPower(b, r, doorWindow(b, lead)) > bulk * 1.2) continue;
    const m = mineCol(b, r);
    for (const c of [2, 1, 0]) {
      if (m >= 0 && c > m) continue;
      if (!cellEmpty(b, c, r)) continue;
      if (gridToPixelX(c, b.bg) + 41 > lead.x) continue;
      return { c, r };
    }
  }
  return null;
}
// Chomper: the close-range answer potato can't give (70t fuse, gulps one
// ---- fog plants: plantern lamp (25) + blover (27) ----
// Plantern: two lamps cover the lawn — the size-4 clear diamond (with the
// dx+dy==5 corner notch) overlaps heavily, so a third lamp buys almost no
// new vision. Lamps sit IN the fog-side columns (3-7): the clear window
// tracks the roll offset (x in [col-4-offX, col+4-offX], offX =
// (fogOffset+50)/100), and a lamp left of the bank clears nothing once the
// offset settles. Cells are scored by the dense fog their diamond actually
// covers (same notch rule as Board::ClearFogAroundPlant); useless cells
// (thin fog, behind the horde, about to be chewed) are skipped. Land ONLY
// (a lamp never pays the lily tax); null past the cap or with no useful
// land cell so the branch falls through to guns.
function planternFogValue(b, c, r) { // total dense-fog density this lamp would clear
  try {
    if (!isFog(b) || !b.gridCelFog) return 0;
    const offX = Math.floor(((b.fogOffset || 0) + 50) / 100);
    const left = typeof b.leftFogColumn === "function" ? b.leftFogColumn() : 5;
    let v = 0;
    for (let x = Math.max(c - 4 - offX, left); x <= Math.min(c + 4 - offX, 8); x++) {
      for (let y = Math.max(r - 4, 0); y <= Math.min(r + 4, b.rows); y++) {
        const dx = Math.abs(x + offX - c), dy = Math.abs(y - r);
        if (dx > 3 || dy > 2) continue;
        if (dx + dy === 5) continue;
        const d = (b.gridCelFog[x] ? b.gridCelFog[x][y] : 0) | 0;
        if (d > 100) v += d;
      }
    }
    return v;
  } catch (e) { return 0; }
}
function planternCell(b, rows) {
  if (countSeed(b, 25) >= 2) return null;
  const lands = rows.filter((r) => !isPoolTile(b, r));
  if (!lands.length) return null;
  let best = null, bv = 0;
  for (const r of lands) {
    const foes = rowFoes(b, r);
    const lead = foes.length ? foes.reduce((m, z) => (z.x < m.x ? z : m), foes[0]) : null;
    for (let c = 3; c <= 7; c++) {
      if (!cellEmpty(b, c, r)) continue;
      if (lead && gridToPixelX(c, b.bg) + 41 > lead.x - 30) continue; // never behind the horde
      if (minContactTime(b, r, c) < 200) continue; // must survive a couple seconds
      const v = planternFogValue(b, c, r);
      if (v <= 0) continue; // lamp lights nothing here: useless
      // A wall immediately right of the lamp eats the teeth first: lamps
      // survive far longer tucked behind the line than ahead of it.
      let walled = false;
      try {
        const nc = b.cell(c + 1, r);
        const np = nc && nc.base;
        walled = !!(np && !np.dead && (np.seed === 3 || np.seed === 23));
      } catch (e) { /* staging boards without cells */ }
      const score = v + (walled ? 500 : 0);
      if (score > bv || (score === bv && best && c < best.c)) { bv = score; best = { c, r }; }
    }
  }
  return best;
}
// Blover: the blow lands board-wide from anywhere (BlowAwayFliers flags
// every PHASE_BALLOON_FLYING zombie + fogBlown 4000), so placement is just
// a safe back-column land cell that survives the 50t fuse. Water cells
// need a lily the branch won't buy here — land first, then anywhere the
// gun line would sit.
function bloverCell(b, rows) {
  const lands = rows.filter((r) => !isPoolTile(b, r));
  const use = lands.length ? lands : rows;
  return emptyCell(b, [2, 1, 0], use, { avoidMine: true }) || shooterCell(b, rows);
}
// zombie whole, then digests 4000t — one gulper per row at a time). Two
// jobs: (1) sit right behind the wall and gulp whatever starts chewing it,
// safe from pole-vaulters since the nut is the front plant they jump;
// (2) last-ditch instant when no wall is up, the lead is close, and no mine
// can arm in time. Smashers are never chomper food (40dmg tickle + MISS).
function chomperCell(b, rows) {
  const order = [...rows].sort((a, c) => rowPressure(b, c) - rowPressure(b, a));
  for (const r of order) {
    let hasChomp = false, nutCol = -1;
    for (let c = 0; c < 9; c++) {
      const cell = b.cell(c, r);
      const p = cell && cell.base;
      if (!p || p.dead) continue;
      if (p.seed === 6) { hasChomp = true; break; }
      if ((p.seed === 3 || p.seed === 23) && nutCol < 0) nutCol = c;
    }
    if (hasChomp) continue;
    const foes = rowFoes(b, r).filter((z) => zPace(z) > 0 || z.eating);
    if (!foes.length) continue;
    const lead = foes.reduce((m, z) => (z.x < m.x ? z : m), foes[0]);
    if (["boss", "garg", "zamboni", "catapult"].includes(lead.type)) continue;
    const bulk = foes.reduce((s, z) => s + zBulk(z), 0);
    if (nutCol >= 0) {
      // Wall backup: only worth 150 sun when the wall is actually working
      // (something chewing it) or the row's bulk is heavy. The gulper sits
      // directly behind the nut and eats the chewer over it.
      if (!foes.some((z) => z.eating) && bulk < 800) continue;
      const m = mineCol(b, r);
      for (const c of [nutCol - 1, nutCol - 2]) {
        if (c < 0 || (m >= 0 && c > m) || !cellEmpty(b, c, r)) continue;
        const px = gridToPixelX(c, b.bg);
        if (px + 2 > lead.x) continue; // window already walked past
        if (px + 84 < lead.x - 200) continue; // too far ahead: wait
        return { c, r };
      }
      continue;
    }
    // Emergency: no wall, lead close, mine can't arm, guns won't finish.
    // Vaulters would jump the chomper itself — never as the front plant.
    if (foes.some(isVaultThreat)) continue;
    if (lead.x > 350) continue;
    if (rowKillPower(b, r, doorWindow(b, lead)) > bulk * 1.2) continue;
    const m = mineCol(b, r);
    const col = Math.max(0, Math.min(8, Math.floor((lead.x - lawnXMin(b.bg)) / cellW(b.bg))));
    for (let c = col; c >= 0; c--) {
      if (m >= 0 && c > m) continue; // gulper never covers a live mine
      if (!cellEmpty(b, c, r)) continue;
      if (gridToPixelX(c, b.bg) + 84 < lead.x - 40) continue; // never reaches the window
      return { c, r };
    }
  }
  return null;
}
// Conveyor pick: the same need-first priorities as decidePickup, constrained
// to the seeds actually on the belt — the leftmost packet carrying the
// wanted seed (first to slide in). Leftmost overall when nothing is wanted.
// Packets younger than 1s (100 ticks at 100tps) are untouchable: the bot
// must let a fresh packet sit before lifting it, so both the wanted-seed
// search and the fallback scan only consider aged packets. Packets without
// a born stamp (old test staging) count as aged. Nothing placeable means no
// pickup: the old leftmost-anything fallback just lifted packets the hold
// branch would cancel. decidePickup already placement-proves `want`, so its
// packets are taken directly; the fallback scans leftmost-first for any
// placeable seed.
const CONV_PACKET_MIN_AGE = 100; // 1s at 100tps
function convPacketReady(b, p) {
  if (p.born === undefined || p.born === null) return true;
  return (b.tick | 0) - p.born >= CONV_PACKET_MIN_AGE;
}
// Liftable = aged 1s+ AND visible on the belt (fresh packets spawn past the
// right clip edge with zero drawn pixels). Boards without the visibility
// helper (old test staging) skip that gate.
function convPacketLiftable(b, i) {
  if (!convPacketReady(b, b.convPackets[i])) return false;
  if (typeof b.convPacketVisible === "function" && !b.convPacketVisible(i)) return false;
  return true;
}
function pickConvSeed(b) {
  const rows = playableRows(b);
  const readyIdx = [];
  for (let i = 0; i < b.convPackets.length; i++) {
    if (convPacketLiftable(b, i)) readyIdx.push(i);
  }
  if (!readyIdx.length) return -1;
  const present = readyIdx.map((i) => b.convPackets[i].seed);
  const want = decidePickup(b, rows, present);
  let bi = -1, bx = Infinity;
  if (want >= 0) {
    for (const i of readyIdx) {
      if (b.convPackets[i].seed !== want) continue;
      if (b.convPackets[i].offset < bx) { bx = b.convPackets[i].offset; bi = i; }
    }
    if (bi >= 0) return bi;
  }
  const order = [...readyIdx]
    .sort((a, c) => b.convPackets[a].offset - b.convPackets[c].offset);
  for (const i of order) {
    if (placeableCell(b, b.convPackets[i].seed, rows)) return i;
  }
  return -1;
}
function cherryClump(b, rows) { // richest blast centered on an empty plantable cell
  let best = null;
  for (const r of rows) {
    for (let c = 0; c < 9; c++) {
      const cell = b.cell(c, r);
      if (!cell || cell.crater || cell.grave || cell.base || b.isDirtRow(r)) continue;
      // Only zombies really inside the blast count — the old 150px circle
      // around the zombie center both missed edge kills and credited
      // out-of-range ones. See cherryVictims.
      const victims = cherryVictims(b, c, r).filter((z) => z.x <= 640);
      if (!victims.length) continue;
      let n = 0, bulk = 0, mowerless = false;
      const involved = new Set();
      // Fresh spawns mustering at the screen edge (x>640, about col 7 —
      // spawns start at 780+rand(40)) don't count: the guns get the whole
      // right side to chew them, and cherrying them there is pure waste.
      for (const z of victims) {
        n++; bulk += zBulk(z); involved.add(z.row);
        if (!rowHasMower(b, z.row)) mowerless = true;
      }
      // A mowerless lane has no second chance, so its bulk counts double.
      // The per-head bonus stays flat so one stray still can't trigger it.
      const value = (mowerless ? bulk * 2 : bulk) + n * 100;
      if (!best || value > best.value) best = { r, c, value, n, bulk, involved: [...involved] };
    }
  }
  return best;
}
// Cherry blast (Plant::DoSpecial cherry: KillAllZombiesInRadius(115, 1 row
// each way, burn, range flags 127)): the exact sim predicate, so the bot
// only ever plants where zombies are really inside the 3x3 blast centered
// on the cherry — never on bare lawn next to them.
const CHERRY_RADIUS = 115;
function cherryVictims(b, c, r) {
  const cx = gridToPixelX(c, b.bg) + 40, cy = gridToPixelY(c, r, b.bg) + 40;
  const out = [];
  for (const z of b.zombies) {
    if (z.dead || z.gone) continue;
    if (!foeVisible(z, b)) continue; // fog-of-war: never cherry what it can't see
    if (typeof z.effectedByDamage === "function" && !z.effectedByDamage(127)) continue;
    if (typeof z.zombieRect !== "function") continue; // sensed-object insurance (sim boards always have it)
    const rowDist = z.type === "boss" ? 0 : z.row - r;
    if (rowDist > 1 || rowDist < -1) continue;
    const rect = z.zombieRect();
    let dx = 0, dy = 0, xOut = false, yOut = false;
    if (cx < rect.x) { xOut = true; dx = rect.x - cx; }
    else if (cx > rect.x + rect.w) { xOut = true; dx = cx - rect.x - rect.w; }
    if (cy < rect.y) { yOut = true; dy = rect.y - cy; }
    else if (cy > rect.y + rect.h) { yOut = true; dy = cy - rect.y - rect.h; }
    let hit;
    if (!xOut && !yOut) hit = true;
    else if (xOut && yOut) hit = dx * dx + dy * dy <= CHERRY_RADIUS * CHERRY_RADIUS;
    else if (xOut) hit = dx <= CHERRY_RADIUS;
    else hit = dy <= CHERRY_RADIUS;
    if (hit) out.push(z);
  }
  return out;
}
function doorCell(b, rows, r, lead) { // nearest empty ground whose blast covers the breakthrough
  const col = Math.max(0, Math.min(8, Math.floor((lead.x - lawnXMin(b.bg)) / cellW(b.bg))));
  const order = [col];
  for (let d = 1; d <= 8; d++) { if (col - d >= 0) order.push(col - d); if (col + d <= 8) order.push(col + d); }
  for (const c of order) {
    if (!cellEmpty(b, c, r)) continue;
    // The breakthrough zombie itself must be inside the blast — a cell two
    // columns away is outside the 115px radius and wastes the cherry.
    if (cherryVictims(b, c, r).includes(lead)) return { c, r };
  }
  return null;
}
// One cherry pick shared by decidePickup and cherryCell, so the choice and
// the placement can never disagree. Priority: (1) mowerless door
// emergency, (2) rich walked-in clump, (3) last-resort door save.
function cherryTarget(b, rows) {
  let bx = Infinity, br = -1, bLead = null;
  for (const r of rows) {
    if (rowHasMower(b, r)) continue;
    // A jumped wall-nut is no wall at all: only a tall-nut or a solid
    // (vaulter-free) wall counts as protection here.
    if (rowNutCredit(b, r) >= 1) continue;
    const lead = leadFoe(b, r);
    if (!lead || lead.x >= 260) continue;
    // Don't burn the cherry when the row's guns finish the lead before the
    // door (doorWindow floors stalled chewers: an eating zombie is paused,
    // not solved, so the guns are credited only with the time they get).
    const tDoor = doorWindow(b, lead);
    if (rowKillPower(b, r, tDoor) > zBulk(lead) * 1.2) continue;
    if (lead.x < bx) { bx = lead.x; br = r; bLead = lead; }
  }
  if (br >= 0) {
    const dc = doorCell(b, rows, br, bLead);
    // No empty cell covers the breakthrough (all occupied or cratered):
    // fall through to the clump/door-save picks rather than burning the
    // cherry on bare lawn.
    if (dc) return dc;
  }
  const clump = cherryClump(b, rows);
  // A rich clump is only worth the 150 sun + 5000t recharge when the guns
  // CAN'T chew it: every involved row must fail its kill-power check (a
  // nut's stall time credited, eating zombies floored as paused not solved).
  // Otherwise the whole lawn gets to work and the cherry stays banked for a
  // real emergency.
  if (clump && clump.value >= 700) {
    let needed = false;
    for (const rr of clump.involved) {
      const foes = rowFoes(b, rr);
      if (!foes.length) continue;
      const lead = foes.reduce((m, z) => (z.x < m.x ? z : m), foes[0]);
      const bulk = foes.reduce((s, z) => s + zBulk(z), 0);
      const tDoor = doorWindow(b, lead) + (rowNutCredit(b, rr) >= 1 ? 1200 : 0);
      if (rowKillPower(b, rr, tDoor) <= bulk * 1.2) { needed = true; break; }
    }
    if (needed) return { c: clump.c, r: clump.r };
  }
  bx = Infinity; br = -1; bLead = null;
  for (const r of rows) {
    if (rowNutCredit(b, r) >= 1) continue;
    const lead = leadFoe(b, r);
    if (lead && lead.x < 200 && lead.x < bx) { bx = lead.x; br = r; bLead = lead; }
  }
  if (br >= 0) {
    const dc = doorCell(b, rows, br, bLead);
    if (dc) return dc;
  }
  return null;
}
function cherryCell(b, rows) {
  // No verified blast, no cherry: the old emptyCell fallback planted it on
  // bare lawn whenever the target died between pickup and placement (the
  // reported misplacement). Null safely cancels the hold (actBoard).
  return cherryTarget(b, rows);
}
// Hypno-shroom: converts the zombie that eats it (Zombie::AnimateChewEffect
// 4733 — the convert happens at a hand swing, ally from then on), so it
// wants exactly one high-hp walker that will chew it: a single chewable
// headed non-vaulting foe with combined bulk >= 700 (bucket/door/football/
// ladder class — cones and regulars die to guns), still approaching (not
// already chewing something else: a shroom planted behind an eaten wall
// would wait out the whole stall while the row needs the convert now).
// Day shrooms sleep and the bot carries no coffee, so this is night-only
// (nocturnals are awake at night). One converter per row; sits
// rightmost-ahead of the lead like the chomper emergency spot, never
// covering a live mine, never behind the horde.
function hypnoTarget(b, rows) {
  if (!boardNight(b, b.level)) return null;
  const order = [...rows].sort((a, c) => rowPressure(b, c) - rowPressure(b, a));
  for (const r of order) {
    const foes = rowFoes(b, r);
    if (foes.length !== 1) continue; // single targets only
    const z = foes[0];
    if (!zCanChew(z) || !z.hasHead) continue; // smashers/flyers/headless never eat
    if (isVaultThreat(z)) continue; // jumps the shroom, never eats it
    if (z.eating || zPace(z) <= 0) continue; // occupied or stalled: nothing to convert yet
    if (zBulk(z) < 700) continue; // guns answer the small stuff
    if (z.x >= 760) continue; // not on the lawn yet
    if (b.allPlants().some((p) => !p.dead && p.seed === 12 && p.row === r)) continue;
    const m = mineCol(b, r);
    for (let c = 8; c >= 0; c--) {
      if (m >= 0 && c > m) continue; // never cover a live mine
      if (!cellEmpty(b, c, r)) continue;
      if (gridToPixelX(c, b.bg) + 41 > z.x) continue; // never behind the horde
      return { c, r };
    }
  }
  return null;
}
function hypnoCell(b, rows) { return hypnoTarget(b, rows); }
// Wall-nut Bowling rollers (L5) plant through plantBowler, whose canPlant
// gate is ONLY the bowling line (cols 0-2, Challenge::CanPlantAt 2452-2455)
// — the nut/shooter cell finders pick cols up to 8, which canPlant always
// rejects on bowling levels, so the placement-first proof starved the belt
// (pickConvSeed -1 forever, nothing ever lifted). Rollers go in cols 0-2 of
// the weakest row, like the live placement always did.
function bowlingCell(b, rows) {
  const r = weakestRow(b, rows);
  return { c: (Math.random() * 3) | 0, r };
}
function cellForSeed(b, seed, rows) {
  if (b.isBowling) return bowlingCell(b, rows); // wall-nut + explode-o-nut both roll
  if (seed === 16) return poolLilyCell(b, rows); // lily goes exactly where the blocked plant wants to be
  if (seed === 33) return roofPotCell(b, rows); // pot goes exactly where the blocked plant wants to be
  if (seed === 1 || seed === 9) return sunflowerCell(b, rows);
  if (seed === 3 || seed === 23) return nutCell(b, seed, rows);
  if (seed === 4) return potatoCell(b, rows);
  if (seed === 2) return cherryCell(b, rows);
  if (seed === 12) return hypnoCell(b, rows);
  if (seed === 25) return planternCell(b, rows); // fog lamp: capped inner-land placement, never a lily tax
  if (seed === 27) return bloverCell(b, rows); // reactive blow: back-column land, anywhere works
  if (seed === 19) return tangleCell(b, rows); // bare-water instant: no lily, never via shooterCell
  if (seed === 24) return seaCell(b, rows); // bare-water spammer: no lily, never via shooterCell
  if (seed === 17) return squashCell(b, rows); // leaping door-save: back-column placement, lily-needing on water
  if (seed === 18) { // threepeater covers own ± 1 rows: middle rows fire all 3 lanes, edges only 2
    const mid = rows.filter((r) => rows.includes(r - 1) && rows.includes(r + 1));
    if (mid.length) {
      try {
        const c = shooterCell(b, mid);
        // shooterCell picks weakestRow(mid) — but if that row needs no gun
        // while an edge row does, fall through to the full-row pick below.
        if (c && (rowPressure(b, c.r) > 0.05 || rowNeedsGun(b, c.r))) return c;
      } catch (e) { /* fall through to full rows */ }
    }
  }
  if (seed === 6) return chomperCell(b, rows);
  if (seed === 11) return graveCell(b, rows);
  return shooterCell(b, rows); // shooters (pea/snow/repeater/threepeater/puff/fume/...): column 2 of weakest row, overflow to 5
}

// ---- gun upgrades: shovel a weaker barrel to replant a stronger one ----
// Only when the bot is idle-rich: decidePickup already returned -1 (defense,
// economy and the opening book all satisfied — never competing with a real
// need), the sun stockpile covers the new gun plus a cherry reserve, and no
// plant went down recently. Upgrades never fire during tutorials, on
// conveyor/bowling/whack boards, or in rows with teeth on the lawn (the swap
// briefly disarms the row). Sequence runs across thinks: arm shovel -> dig
// the old gun -> lift the new packet -> plant the same cell (the lily/pot
// host underneath survives the shovel, so pool/pot cells just work).
const UPGRADES = { 0: 7, 5: 7, 7: 18, 8: 10 }; // pea->repeater, snow->repeater, repeater->threepeater, puff->fume
const UPGRADE_IDLE_MS = 30000; // no plant in the last 30s
const UPGRADE_RESERVE = 150; // keep cherry money after paying for the new gun
const UPGRADE_TUTS = new Set([TUT.OFF, TUT.L1_COMPLETED, TUT.L2_COMPLETED, TUT.SHOVEL_COMPLETED, TUT.WHACK_COMPLETED]);
function upgradeTarget(b, rows) {
  if (!UPGRADE_TUTS.has(b.tutorialState)) return null;
  if (b.isConveyor || b.isBowling || b.isWhack || b.isVase) return null;
  if (!b.showShovel) return null;
  if ((bot.urg || 0) >= 0.15) return null; // hands are busy elsewhere
  if (bot.lastPlantAt !== null && performance.now() - bot.lastPlantAt < UPGRADE_IDLE_MS) return null;
  const avail = bank();
  const UP = isRoof(b) ? { 32: 34, 34: 39, 0: 32, 5: 32, 7: 32, 8: 32, 10: 32, 13: 32, 18: 32, 26: 32, 28: 32, 29: 32 } : UPGRADES; // roof: everything climbs the catapult ladder (cabbage -> kernel -> melon); straight barrels upgrade OUT to cabbage
  const cands = [];
  for (const r of rows) {
    if (rowFoes(b, r).length) continue; // teeth on the lawn: never disarm this row
    for (let c = 0; c < 9; c++) {
      const cell = b.cell(c, r);
      const p = cell && cell.base;
      if (!p || p.dead) continue;
      const to = UP[p.seed];
      if (to === undefined) continue; // only weaker barrels upgrade
      if (!avail.includes(to) || seedBanned(to)) continue;
      if (cell.flying && !cell.flying.dead) continue; // coffee stack: leave it
      if (cell.grave || cell.crater) continue; // replant could never land
      if (b.sun < PLANTS[to].cost + UPGRADE_RESERVE) continue;
      try { if (!b.canPickUpSeed(to)) continue; } catch (e) { continue; }
      cands.push({ c, r, from: p.seed, to });
    }
  }
  if (!cands.length) return null;
  const prio = isRoof(b) ? { 32: 0, 34: 1 } : { 8: 0, 0: 1, 5: 2, 7: 3 }; // free puff first, then pea, snow, repeater->threepeater last
  cands.sort((a, c2) => ((prio[a.from] ?? 9) - (prio[c2.from] ?? 9)) || (a.c - c2.c) || (rowPressure(b, a.r) - rowPressure(b, c2.r)));
  return cands[0];
}
function abortUpgrade(reason) {
  if (bot.upg && reason) say(`upgrade aborted: ${reason}`);
  bot.upg = null;
}
async function shovelSlotClick() {
  await clickAt(10 + SHOVEL_X + 35 + rand(-4, 4), 43 + rand(-4, 4));
}
async function startUpgrade(b, rows) {
  const t = upgradeTarget(b, rows);
  if (!t) return false;
  await shovelSlotClick();
  if (!G().shovelMode) return false; // no shovel on the bank (or click missed)
  bot.upg = { ...t, phase: "dig", tries: 0, board: b, level: b.level };
  say(`upgrading ${t.from}@${t.c},${t.r} to ${t.to} — shovel armed`);
  return true;
}
async function continueUpgrade(b) {
  const u = bot.upg;
  if (!u || u.board !== b || u.level !== b.level) { abortUpgrade(); return true; }
  if ((bot.urg || 0) >= 0.6) { abortUpgrade("heat is on, defending first"); await cancelHold(); return true; }
  const cell = b.cell(u.c, u.r);
  const want = { c: u.c, r: u.r };
  if (u.phase === "dig") {
    // Shovel may have disarmed under us (or the plant changed): re-arm or quit.
    if (!G().shovelMode) {
      if (++u.tries > 2) { abortUpgrade("shovel would not stay armed"); return true; }
      await shovelSlotClick();
      return true;
    }
    const p = cell && cell.base;
    if (!p || p.dead || p.seed !== u.from) { abortUpgrade("target gun is gone"); await cancelHold(); return true; }
    const pt = cellCenter(b, u.c, u.r);
    await clickAt(pt.x + rand(-4, 4), pt.y + rand(-4, 4));
    const after = b.cell(u.c, u.r);
    if (!after || !after.base || after.base.dead) {
      u.phase = "pick"; // dug (the sweep clears the corpse next tick)
      say(`dug ${u.from}@${u.c},${u.r} — lifting ${u.to}`);
    } else if (++u.tries > 2) {
      abortUpgrade("dig missed twice"); await cancelHold();
    }
    return true;
  }
  if (u.phase === "pick") {
    if (G().selSeed >= 0 || G().selConvIdx >= 0 || G().shovelMode) return true; // still holding something: wait
    if (!bank().includes(u.to)) { abortUpgrade("packet left the bank"); return true; }
    try { if (!b.canPickUpSeed(u.to)) return true; } catch (e) { abortUpgrade("packet not liftable"); return true; } // recharge will clear: wait
    const idx = bank().indexOf(u.to);
    await moveTo(10 + packetX(bank().length, idx) + 25 + rand(-3, 3), PACKET_Y + 35 + rand(-3, 3));
    if (!b.canPickUpSeed(u.to)) return true;
    await pressAt();
    if (G().selSeed === u.to) { u.phase = "plant"; }
    else { abortUpgrade("packet would not lift"); await cancelHold(); }
    return true;
  }
  // "plant" while empty-handed should not happen (the hold branch owns it):
  // the seed must have been lost — drop the plan, don't re-lift here.
  abortUpgrade();
  return false;
}

// Urgency (0..1, refreshed every think mid-level) hurries the hands — cursor
// speed and press dwell — but never inserts waits. The loop below re-thinks
// the moment the last action's motion finishes.
function urgency(b) {
  if (!b || b.state !== "play" || b.paused || b.fadeOut >= 0) return 0;
  let u = 0, seen = 0;
  for (const z of b.zombies) {
    if (z.dead || z.gone || (z.type === "bungee" && !z.bungeeOnLawn()) || z.mowed || z.houseWalk || z.ally) continue;
    if (!foeVisible(z, b)) continue; // fog-of-war: hidden zombies don't hurry the hands
    seen++;
    const prox = zProx(z); // closest body to the door always counts, whatever it is
    const t = zThreat(b, z); // high HP + fast + close scores higher
    if (prox > u) u = prox;
    if (t > u) u = Math.min(1.5, t);
  }
  if (seen > 2) u = Math.min(1.5, u + (seen - 2) * 0.05); // a crowd quickens the hands
  // Thin row about to break counts as urgent even from far out.
  for (let r = 0; r < b.rows; r++) {
    if (b.isDirtRow(r)) continue;
    if (rowShooters(b, r) < 1 && rowPressure(b, r) > 0.8) { u = Math.max(u, 0.75); break; }
  }
  return Math.min(1, u);
}

// ---- per-screen actors (each performs ≤1 human click, then yields) ----
async function actMenu() {
  const g = G();
  if (g.menuStarting) { await sleep(rand(120, 250)); return; } // hand rising — wait on the game, not pacing
  if (g.userPopup === "create") {
    await typeName("Sunny");
    await clickAt(250 + 70, 340 + 22); // NewUserDialog OK
    return;
  }
  // ("list" popups are handled by actListPopup via think(); reaching here
  // with one open means it just appeared — yield a beat for it to settle.)
  if (g.userPopup === "list") {
    await sleep(rand(300, 600));
    return;
  }
  // adventure tombstone center
  const cur = SAVE.currentUser();
  const lv = Math.min(50, cur?.level ?? 1), fresh = !cur?.finished && lv === 1;
  const ap = trackPos(fresh ? "SelectorScreen_StartAdventure_button" : "SelectorScreen_Adventure_button");
  await clickAt(ap.x + 165, ap.y + 62);
}
async function actListPopup() {
  const g = G();
  // geometry mirror of userPopupGeom list rows: x=230 w=340 rowH=28 listY=y+78
  const n = (g.userRows?.length || 0) + (g.userCreate ? 1 : 0);
  const h = 118 + n * 28 + 52 + 62;
  const y = Math.max(20, (600 - h) / 2);
  const listY = y + 78, footY = listY + n * 28 + 12 + 52;
  await clickAt(230 + 170, listY + 14); // select current profile row
  await clickAt(230 + 40 + 60, footY + 22); // OK
}
async function actCutscene() {
  const g = G(), b = g.board, cs = g.cutscene;
  if (!b || !cs) return;
  // Pre-shop slot offer (Dave 1503/1553): the modal only opens when the
  // profile can afford it, and a slot is strictly more choice — buy it.
  if (g.daveOffer) {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "y", bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keyup", { key: "y", bubbles: true }));
    await sleep(rand(120, 250));
    return;
  }
  if (g.dave && g.dave.msgIndex !== -1) { await clickAt(400, 300); return; } // advance Dave
  const tut = b.tutorialState;
  if (tut === TUT.SHOVEL_PICKUP) { await clickAt(SHOVEL_X + 35, 43); return; }
  if (tut === TUT.SHOVEL_DIG || tut === TUT.SHOVEL_KEEP_DIGGING) {
    // Each dig disarms the shovel (ClearCursor) and only the first dig state
    // auto-reverts to PICKUP — a human re-grabs the shovel for every further
    // dig, so do the same: armed → dig a plant, disarmed → re-arm first.
    if (!g.shovelMode) { await clickAt(SHOVEL_X + 35, 43); return; }
    const p = b.allPlants().find((q) => q.seed === 0) || b.allPlants()[0];
    if (p) { await clickAt(p.x + 40, p.y + 40); return; }
  }
  await sleep(rand(100, 220)); // intro pan with nothing to do: wait on the game
}
async function actChooser() {
  const g = G(), c = g.chooser;
  if (!c) return;
  if (c.inBank >= c.slots && c.inFlight === 0) {
    await clickAt(154 + 78, 545 + 21); // LET'S ROCK
    return;
  }
  // Context picks: the night book answers the level's roster/graves (cheap
  // shrooms, gravebuster, tall-nut for vaulters); day keeps the fixed book.
  for (const seed of chooserWantList(g)) {
    if (c.inBank >= c.slots) break;
    const s = c.seeds.find((q) => q.seed === seed && q.state === 0 && !q.dave);
    if (s) { await clickAt(s.x + 25, s.y + 35); return; }
  }
  // fallback: first available non-Dave seed
  const s = c.seeds.find((q) => q.state === 0 && !q.dave);
  if (s) { await clickAt(s.x + 25, s.y + 35); return; }
  await sleep(rand(120, 240)); // bank full, flights still in the air: wait on the game
}
async function actBoard() {
  const g = G(), b = g.board;
  if (!b || b.state !== "play" || b.paused || g.pauseDlg || b.fadeOut >= 0) {
    await sleep(rand(120, 240)); // transition/fade: wait on the game
    return;
  }
  if (b.isBowling) return actBowling(b);
  // 1) holding something: plant/dig it now — never detour for sun or money
  // mid-placement (a picked-up packet must commit to its cell). Only award
  // coins may interrupt, since collecting them advances the level.
  const holding = g.selSeed >= 0 || g.selConvIdx >= 0 || g.shovelMode;
  if (holding) {
    const award = b.coins.find((c) => !c.collected && !c.dead && typeof c.x === "number" && c.isAward());
    if (award) { const p = coinClickPoint(b, award); await clickAt(p.x, p.y); return; }
  } else {
    // collect: suns about to expire first, then other coins
    const live = b.coins.filter((c) => !c.collected && !c.dead && typeof c.x === "number");
    const suns = live.filter((c) => c.isSun()).sort((a, c2) => (c2.disappear | 0) - (a.disappear | 0));
    const rest = live.filter((c) => !c.isSun()).sort((a, c2) => (c2.disappear | 0) - (a.disappear | 0));
    const target = suns[0] || rest[0];
    if (target) { const p = coinClickPoint(b, target); await clickAt(p.x, p.y); return; }
  }
  // 2) holding something: plant/dig it now (conveyor L10 plants normally
  // through plantAt with the held conv slot — same path as a fixed bank).
  // The target is validated twice: cellForSeed picks a plantable cell, then
  // canPlant — the exact gate plantAt enforces — is re-checked after the
  // hand travels, since the lawn moves under it (an eaten plant's corpse
  // still registers until the sim nulls it, a crater formed, sun moved).
  // A failed attempt disarms + bans briefly and the bot reconsiders instead
  // of hammering the same cell forever.
  if (g.selSeed >= 0) {
    const rows = playableRows(b);
    const seed = g.selSeed;
    // Gun upgrade replant: the cell is the shoveled one, not the strategy's
    // next pick — and the plan dies if the hand is holding anything else.
    const upg = bot.upg && bot.upg.phase === "plant" && bot.upg.board === b && bot.upg.level === b.level ? bot.upg : null;
    if (upg && seed !== upg.to) { abortUpgrade("holding the wrong seed"); await cancelHold(); return; }
    const cell = upg ? { c: upg.c, r: upg.r } : cellForSeed(b, seed, rows);
    if (!cell) {
      noteNoCell(seed);
      await cancelHold();
      if (upg) abortUpgrade("replant cell is gone");
      return;
    }
    if (isPlaceBanned(seed, cell)) {
      // Best cell still banned from a recent fail: sit the seed out briefly
      // so other seeds get picked instead of a pickup/cancel spin.
      bot.seedBan[seed] = Math.max(bot.seedBan[seed] || 0, performance.now() + 3000);
      await cancelHold();
      if (upg) abortUpgrade("replant cell is banned");
      return;
    }
    const p = cellCenter(b, cell.c, cell.r);
    await moveTo(p.x + rand(-6, 6), p.y + rand(-6, 6));
    if (g.selSeed !== seed) return; // seed changed under us (tutorial) — yield
    // Charge-first: a seed that went gray (or unaffordable) after the trip
    // is NOT a placement failure — its cell did nothing wrong. Disarm
    // quietly and wait for the recharge instead of fail-banning a good cell.
    if (!b.canPickUpSeed(seed)) {
      await cancelHold();
      return;
    }
    if (!b.canPlant(cell.c, cell.r, seed)) {
      // Upgrade replant vs a still-sweeping corpse: the sim nulls dug plants
      // on its next tick, so keep holding the packet and retry next think
      // (a live blocker aborts the plan outright).
      if (upg) {
        const cur = b.cell(cell.c, cell.r);
        if (cur && cur.base && cur.base.dead && (upg.tries = (upg.tries | 0) + 1) <= 5) return;
        abortUpgrade("replant blocked");
      }
      notePlaceFail(seed, cell);
      await cancelHold();
      return;
    }
    await pressAt();
    if (g.selSeed === seed) { // still holding: buzz/advice, plant failed
      notePlaceFail(seed, cell);
      await cancelHold();
      if (upg) abortUpgrade("replant buzzed");
    } else {
      clearPlaceBansFor(seed);
      bot.lastPlantAt = performance.now();
      if (upg) say(`upgraded ${upg.from}@${upg.c},${upg.r} to ${seed}`);
      if (upg) bot.upg = null;
    }
    return;
  }
  if (g.shovelMode) {
    // Gun upgrade dig: the plan owns this click. Anything else armed the
    // shovel outside the plan — disarm as before.
    if (bot.upg && bot.upg.board === b && bot.upg.level === b.level) {
      await continueUpgrade(b);
      return;
    }
    await clickAt(rand(300, 500), rand(540, 580)); // never shovel outside tutorial
    return;
  }
  // 3) pick up the next seed (conveyor belt owns its packets on L5/L10)
  if (b.isConveyor) return actConveyorPickup(b);
  const rows = playableRows(b);
  const seed = decidePickup(b, rows);
  if (seed < 0) {
    // Nothing worth planting: continue a pending gun upgrade, or start one
    // when the stockpile allows it — never instead of real defense.
    if (bot.upg && bot.upg.board === b && bot.upg.level === b.level) {
      await continueUpgrade(b);
      return;
    }
    if (bot.upg) abortUpgrade(); // level changed under us
    if (await startUpgrade(b, rows)) return;
    // idle drift: park the cursor low, look alive (the glide itself takes time)
    await moveTo(rand(350, 450), rand(500, 560));
    return;
  }
  // Placement-first: decidePickup already proved a plantable cell, but
  // re-resolve it just before the hand moves — if the placement evaporated
  // (cell taken, cratered, newly banned), wait instead of lifting a packet
  // the hold branch would only cancel.
  if (!placeableCell(b, seed, rows)) {
    await moveTo(rand(350, 450), rand(500, 560));
    return;
  }
  const idx = bank().indexOf(seed);
  if (idx < 0) return;
  const n = bank().length;
  await moveTo(10 + packetX(n, idx) + 25, PACKET_Y + 35);
  // Last-moment charge check: never lift a packet that went gray while the
  // hand traveled — yield and retry when it's charged instead of buzzing it.
  if (!b.canPickUpSeed(seed)) return;
  await pressAt();
}
// Conveyor pickup (L5 bowling + L10 mini-boss): packets are always active and
// free — but they are NOT interchangeable. Ask the strategy which seed the
// board needs and take the leftmost packet carrying it (longest waiting).
async function actConveyorPickup(b) {
  if (!b.convPackets.length) {
    await moveTo(rand(350, 450), rand(500, 560));
    await sleep(rand(120, 240)); // belt empty: wait on the game
    return;
  }
  const bi = pickConvSeed(b);
  if (bi < 0) { await moveTo(rand(350, 450), rand(500, 560)); return; }
  const px = 10 + (bi * 50 + 73) + b.convPackets[bi].offset; // convDrawX: 91-14-4
  await clickAt(px + 25, 8 + 35);
}
async function actBowling(b) {
  const g = G();
  // holding a roller: place it first — same no-sun-detour rule as actBoard
  // (awards still collected so the level can advance).
  const holding = g.selSeed >= 0 || g.selConvIdx >= 0;
  if (holding) {
    const award = b.coins.find((c) => !c.collected && !c.dead && typeof c.x === "number" && c.isAward());
    if (award) {
      const p = coinClickPoint(b, award);
      await clickAt(p.x, p.y);
      return;
    }
    const rows = playableRows(b);
    // Same cell the pickup proved (placement-first invariant): rollers go
    // cols 0-2 of the weakest row, so the hold always commits. Null (no
    // legal lane, e.g. every row dirt — never on L5) drifts instead of
    // burning the packet on a buzz.
    const seed = g.selSeed >= 0 ? g.selSeed
      : (g.selConvIdx >= 0 && b.convPackets[g.selConvIdx] ? b.convPackets[g.selConvIdx].seed : -1);
    const cell = seed >= 0 ? cellForSeed(b, seed, rows) : null;
    if (!cell) { await moveTo(rand(350, 450), rand(500, 560)); return; }
    const p = cellCenter(b, cell.c, cell.r);
    await clickAt(p.x, p.y);
    return;
  }
  // collect first
  const live = b.coins.filter((c) => !c.collected && !c.dead && typeof c.x === "number");
  if (live.length) {
    live.sort((a, c2) => (c2.disappear | 0) - (a.disappear | 0));
    const p = coinClickPoint(b, live[0]);
    await clickAt(p.x, p.y);
    return;
  }
  return actConveyorPickup(b);
}
async function actAward() {
  const cur = SAVE.currentUser();
  const profile = (cur || {}).level || 1;
  await clickAt(324 + 78, ([10, 20, 30, 40, 50].includes(profile) ? 520 : 500) + 21); // note awards (IsPaperNote) sit 20px lower (awardStartRect)
}
// ---- Whack-a-Zombie (L15): the hammer game ----
// The bank holds only potato/gravebuster/cherry and the win condition is
// bonking every riser — normals die in 1 swing, cones in 2, buckets in 3
// (900 helm damage per swing, Challenge::MouseDownWhackAZombie). Risers pop
// fast (riseT 50) and walk, so the hammer does the work while the seeds
// support it: cherry for verified clumps, gravebuster to thin future
// batches, potato ahead of far walkers.
function bonksToKill(z) {
  const helm = z.helm | 0;
  if (helm <= 0) return 1;
  return 1 + Math.ceil(helm / 900);
}
function whackFoes(b) { // bonkable risers, closest-to-the-house first
  const out = [];
  for (const z of b.zombies) {
    if (z.dead || z.gone || z.mowed || (z.burnT | 0) > 0) continue; // IsDeadOrDying (mirrors whackAttackAt)
    if (z.type === "bungee" && !z.bungeeOnLawn()) continue; // divers not on the lawn yet
    out.push(z);
  }
  // Rising zombies sort by grid x like walkers — bonking them as they pop
  // kills them before they walk. Ties clear the lawn fastest (fewer swings).
  out.sort((a, c) => (a.x - c.x) || (bonksToKill(a) - bonksToKill(c)) || (a.id - c.id));
  return out;
}
function whackUrgency(b) { // panic hurries the hand but never past human
  let u = 0, seen = 0;
  for (const z of b.zombies) {
    if (z.dead || z.gone || z.mowed || (z.type === "bungee" && !z.bungeeOnLawn())) continue;
    seen++;
    const p = zProx(z); // 0 still offscreen-right → 1 at the door (x≤200)
    if (p > u) u = p;
  }
  if (seen > 2) u = Math.min(1, u + (seen - 2) * 0.08); // a crowd quickens the hands
  return Math.min(0.85, u);
}
// Human swing cadence: a whack-a-mole hand manages ~4-6 aimed clicks/sec
// calm, ~7-8 in a full panic flurry — never machine-gun 0ms gaps. Travel
// time + press dwell sit on top, so the true rate is slower still.
function whackGap() {
  return rand(130, 250) * (1 - Math.min(0.85, bot.urg || 0) * 0.45);
}
// What the hand lifts: cherry only with a verified blast (cherryTarget
// self-gates on value), then — away from emergencies — gravebuster on
// standing stones and potato where it arms in time (both self-gate on
// placement). -1 means nothing worth lifting.
function whackPickup(b, rows, emergency) {
  const ready = (s) => bank().includes(s) && b.canPickUpSeed(s) && !seedBanned(s);
  if (b.bankY <= -30) return -1; // bank still sliding in: nothing clickable yet
  if (ready(2)) {
    try { if (cherryTarget(b, rows) && placeableCell(b, 2, rows)) return 2; } catch (e) { /* fall through */ }
  }
  if (emergency) return -1;
  if (ready(11) && b.hasGraves()) {
    try { if (placeableCell(b, 11, rows)) return 11; } catch (e) { /* fall through */ }
  }
  if (ready(4)) {
    try { if (placeableCell(b, 4, rows)) return 4; } catch (e) { /* fall through */ }
  }
  return -1;
}
// One hammer swing at a riser: travel to its head, re-aim after the trip
// (the lawn moves under the hand — the target may have died, so the loop
// retargets once), press, then the human swing cadence.
async function bonkFoe(b, z) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const t = b.zombies.find((q) => q.id === z.id && !q.dead && !q.gone) || whackFoes(b)[0];
    if (!t) return;
    let r;
    try { r = t.zombieRect(); } catch (e) { return; }
    // Lead the walker a little (humans swing where it's going, not where it
    // was) — risers don't move until riseT runs out, so they take no lead.
    const lead = t.phase === "rising" ? 0 : Math.min(40, zPace(t) * 25);
    await moveTo(r.x + r.w / 2 - lead + rand(-8, 8), r.y + r.h / 2 + 20 + rand(-6, 6));
    const cur = b.zombies.find((q) => q.id === t.id);
    if (cur && !cur.dead && !cur.gone) { z = cur; break; }
    // Died under the traveling hand: loop re-aims at the next foe.
  }
  await pressAt();
  await sleep(whackGap()); // swing cadence, not machine-gun
}
async function actWhack(b) {
  const g = G(), rows = playableRows(b);
  // Holding a seed: commit to its cell now — never detour mid-placement.
  if (g.selSeed >= 0) {
    const award = b.coins.find((c) => !c.collected && !c.dead && typeof c.x === "number" && c.isAward());
    if (award) { const p = coinClickPoint(b, award); await clickAt(p.x, p.y); return; }
    const seed = g.selSeed;
    const cell = cellForSeed(b, seed, rows);
    if (!cell) {
      noteNoCell(seed);
      await cancelHold();
      return;
    }
    if (isPlaceBanned(seed, cell)) {
      bot.seedBan[seed] = Math.max(bot.seedBan[seed] || 0, performance.now() + 3000);
      await cancelHold();
      return;
    }
    const p = cellCenter(b, cell.c, cell.r);
    await moveTo(p.x + rand(-6, 6), p.y + rand(-6, 6));
    if (g.selSeed !== seed) return;
    if (!b.canPickUpSeed(seed)) {
      await cancelHold();
      return;
    }
    if (!b.canPlant(cell.c, cell.r, seed)) {
      notePlaceFail(seed, cell);
      await cancelHold();
      return;
    }
    await pressAt();
    if (g.selSeed === seed) {
      notePlaceFail(seed, cell);
      await cancelHold();
    } else {
      clearPlaceBansFor(seed);
    }
    return;
  }
  if (g.shovelMode) { await cancelHold(); return; } // no shovel on the whack lawn
  // The award coin ends the level: take it first.
  {
    const award = b.coins.find((c) => !c.collected && !c.dead && typeof c.x === "number" && c.isAward());
    if (award) { const p = coinClickPoint(b, award); await clickAt(p.x, p.y); return; }
  }
  const foes = whackFoes(b);
  const emergency = foes.length > 0 && foes[0].x < 260;
  if (emergency) { await bonkFoe(b, foes[0]); return; } // teeth at the door: only the hammer
  // Cherry answers a verified clump even mid-wave (the final batches
  // especially) — two hand trips for a multi-kill.
  if (whackPickup(b, rows, true) === 2) {
    const idx = bank().indexOf(2);
    if (idx >= 0) {
      const n = bank().length;
      let by = b.bankY;
      await moveTo(10 + packetX(n, idx) + 25, PACKET_Y + by + 35);
      // The bank may still be sliding in: correct the trip before pressing.
      if (Math.abs(b.bankY - by) > 3) {
        by = b.bankY;
        await moveTo(10 + packetX(n, idx) + 25, PACKET_Y + by + 35);
      }
      if (b.canPickUpSeed(2)) await pressAt();
      return;
    }
  }
  if (foes.length) {
    // Everything is far: grab a sun between swings (cherry/buster fund) —
    // otherwise hammer the closest riser.
    if (foes[0].x > 450) {
      const sun = b.coins.find((c) => !c.collected && !c.dead && typeof c.x === "number" && c.isSun());
      if (sun) { const p = coinClickPoint(b, sun); await clickAt(p.x, p.y); return; }
    }
    await bonkFoe(b, foes[0]);
    return;
  }
  // Quiet lawn: collect first, then build (buster/mines), else hold still —
  // no idle cursor drift on whack levels.
  {
    const live = b.coins.filter((c) => !c.collected && !c.dead && typeof c.x === "number");
    const suns = live.filter((c) => c.isSun()).sort((a, c2) => (c2.disappear | 0) - (a.disappear | 0));
    const rest = live.filter((c) => !c.isSun()).sort((a, c2) => (c2.disappear | 0) - (a.disappear | 0));
    const target = suns[0] || rest[0];
    if (target) { const p = coinClickPoint(b, target); await clickAt(p.x, p.y); return; }
  }
  {
    const want = whackPickup(b, rows, false);
    if (want >= 0) {
      const idx = bank().indexOf(want);
      if (idx >= 0) {
        const n = bank().length;
        let by = b.bankY;
        await moveTo(10 + packetX(n, idx) + 25, PACKET_Y + by + 35);
        if (Math.abs(b.bankY - by) > 3) {
          by = b.bankY;
          await moveTo(10 + packetX(n, idx) + 25, PACKET_Y + by + 35);
        }
        if (b.canPickUpSeed(want)) await pressAt();
        return;
      }
    }
  }
  await sleep(rand(150, 350)); // nothing to do: hold the cursor, don't drift
}

// ---- Vasebreaker (L35): smash vases, plant what pops, hold the line ----
// Live zombies (no peeking: the bot never reads vase contents — leaf state
// and positions are visible, contents are not).
function vaseLiveZombies(b) {
  const out = [];
  for (const z of b.zombies) {
    if (z.dead || z.gone || z.mowed || z.houseWalk || z.ally || (z.type === "bungee" && !z.bungeeOnLawn())) continue;
    out.push(z);
  }
  return out;
}
// Resting usable-seed coins waiting for a pickup (held/expired ones excluded).
function vaseRestingCoins(b) {
  return b.coins.filter((c) => !c.dead && !c.collected && !c.held && typeof c.x === "number" &&
    typeof c.isUsable === "function" && c.isUsable());
}
// Close teeth the row's guns can't chew before the door: the squash case.
function vaseEmergency(b) {
  for (let r = 0; r < b.rows; r++) {
    const foes = rowFoes(b, r).filter((z) => zPace(z) > 0 || z.eating);
    if (!foes.length) continue;
    const lead = foes.reduce((m, z) => (z.x < m.x ? z : m), foes[0]);
    if (lead.x > 350) continue; // squashCell's own pressured-row gate
    const bulk = foes.reduce((s, z) => s + zBulk(z), 0);
    if (rowKillPower(b, r, doorWindow(b, lead)) < bulk) return true;
  }
  return false;
}
// A row earns a shooter: teeth with no gun, earned depth, or the quiet
// opening (a gun per row before the first scout walks in).
function vaseWantsShooter(b, rows) {
  let shooters = 0;
  for (const r of rows) {
    const foes = rowFoes(b, r);
    if (foes.length && rowShooters(b, r) === 0) return true;
    if (foes.length && rowNeedsGun(b, r)) return true;
    shooters += rowShooters(b, r);
  }
  if (!b.zombies.some((z) => !z.dead && !z.gone) && shooters < rows.length) return true;
  return false;
}
// Squash fallback: a waiting leaper in a back column (never wasted).
function vaseBackCell(b, rows) {
  try {
    const r = weakestRow(b, rows);
    const c = emptyCell(b, [0, 1, 2], [r]);
    if (c) return c;
  } catch (e) { /* fall through */ }
  return emptyCell(b, [0, 1, 2, 3, 4, 5], rows);
}
// Hypno fallback: the first empty cell in the most pressured row's teeth path.
function vaseHypnoFallback(b, rows) {
  const order = [...rows].sort((a, c) => rowPressure(b, c) - rowPressure(b, a));
  for (const r of order) {
    const foes = rowFoes(b, r).filter((z) => zPace(z) > 0 || z.eating);
    if (!foes.length) continue;
    const lead = foes.reduce((m, z) => (z.x < m.x ? z : m), foes[0]);
    for (let c = 8; c >= 0; c--) {
      if (!cellEmpty(b, c, r)) continue;
      if (gridToPixelX(c, b.bg) + 41 > lead.x) continue; // never behind the horde
      return { c, r };
    }
  }
  return null;
}
// Where a held usable seed goes (verified with the exact canPlant gate, free
// planting — vase cells always refuse). Last resort sweeps the whole lawn so
// a packet never blinks out while any cell takes it.
function vasePlantCell(b, seed, rows) {
  const ok = (cell) => {
    if (!cell) return null;
    try { return b.canPlant(cell.c, cell.r, seed, true) ? cell : null; }
    catch (e) { return null; }
  };
  try {
    if (seed === 17) return ok(squashCell(b, rows)) || ok(vaseBackCell(b, rows));
    if (seed === 12) return ok(hypnoTarget(b, rows)) || ok(vaseHypnoFallback(b, rows));
    const c = ok(shooterCell(b, rows));
    if (c) return c;
  } catch (e) { /* fall through to the sweep */ }
  for (const c of [0, 1, 2, 3, 4, 5, 6, 7, 8]) for (const r of rows) {
    try { if (b.canPlant(c, r, seed, true)) return { c, r }; } catch (e) { /* next */ }
  }
  return null;
}
// Which resting coin to lift (single pickup per think). Door-saves first,
// then targeted converts, earned guns, waiting leapers, and finally anything
// plantable — a packet never blinks out while the lawn takes it.
function vasePickCoin(b, rows, rest) {
  const has = (s) => rest.some((c) => c.seed === s);
  const plantable = (s) => {
    try { return !!vasePlantCell(b, s, rows); } catch (e) { return false; }
  };
  if (has(17) && vaseEmergency(b) && plantable(17)) return 17;
  if (has(12)) {
    try { if (hypnoTarget(b, rows) && plantable(12)) return 12; } catch (e) { /* fall through */ }
  }
  if (vaseWantsShooter(b, rows)) {
    for (const s of [0, 5]) if (has(s) && plantable(s)) return s;
  }
  if (has(17) && plantable(17)) return 17;
  if (has(12) && plantable(12)) return 12;
  for (const s of [0, 5]) if (has(s) && plantable(s)) return s;
  for (const c of rest) if (plantable(c.seed)) return c.seed;
  return -1;
}
// Safe to smash: mallet free, hands empty, no plant backlog, no Dave, and no
// fresh front opening into an unanswered close threat (breakTarget already
// picks the safest row — this gate only holds the hand while a row burns).
function vaseSafeToBreak(b) {
  if (!b.vases.length || b.mallet || b.state !== "play") return false;
  const g = G();
  if (!g || g.selUsable || g.selSeed >= 0 || g.selConvIdx >= 0 || g.shovelMode) return false;
  if (g.dave) return false;
  if (vaseRestingCoins(b).length > 0) return false;
  const foes = vaseLiveZombies(b);
  if (!foes.length) return true;
  const shooters = countSeed(b, 0) + countSeed(b, 5);
  if (foes.length >= 4 + shooters) return false; // too much already walking
  for (const z of foes) {
    if (z.x >= 300 || z.houseWalk) continue;
    let answered = false;
    for (let c = 0; c < 9; c++) {
      const cell = b.cell(c, z.row);
      const p = cell && cell.base;
      // A planted converter counts: the eater turns and holds its own row.
      if (p && !p.dead && (isShooter(p.seed) || p.seed === 17 || p.seed === 12)) { answered = true; break; }
    }
    if (!answered) return false;
  }
  return true;
}
// Which vase to smash: leaf-marked (known seed) before blind questions, then
// the rightmost cell of the safest row — away from live jacks (their blast
// chains nearby vases open) and away from close teeth.
function vaseBreakTarget(b) {
  if (!b.vases.length || b.mallet) return null;
  const jacks = [];
  for (const z of b.zombies) {
    if (z.dead || z.gone || z.mowed || z.ally) continue;
    if (z.type !== "jack") continue;
    const col = Math.max(0, Math.min(8, Math.floor((z.x - lawnXMin(b.bg)) / cellW(b.bg))));
    jacks.push({ c: col, r: z.row });
  }
  const nearJack = (v) => jacks.some((j) => Math.abs(j.c - v.col) <= 1 && Math.abs(j.r - v.row) <= 1);
  let pool = b.vases.filter((v) => !nearJack(v));
  if (!pool.length) pool = b.vases.slice();
  const leaf = pool.filter((v) => v.state === "leaf");
  const cands = leaf.length ? leaf : pool;
  let best = null, bs = -Infinity;
  for (const v of cands) {
    let rowZ = 0, rowS = 0, close = 0;
    for (const z of b.zombies) {
      if (z.dead || z.gone || z.mowed || z.ally) continue;
      if (z.row !== v.row) continue;
      rowZ++;
      if (z.x < 350) close++;
    }
    for (let c = 0; c < 9; c++) {
      const cell = b.cell(c, v.row);
      const p = cell && cell.base;
      if (p && !p.dead && isShooter(p.seed)) rowS++;
    }
    const s = v.col * 2 + rowS * 3 - rowZ * 4 - close * 6 + Math.random() * 0.5;
    if (s > bs) { bs = s; best = v; }
  }
  return best;
}
async function actVase(b) {
  const g = G();
  if (!b || b.state !== "play" || b.paused || g.pauseDlg || b.fadeOut >= 0) {
    await sleep(rand(120, 240)); // transition/fade: wait on the game
    return;
  }
  const rows = playableRows(b);
  // Dave owns every click while he's up (Challenge::MouseDown 1261-1265) —
  // the 2702/2801 advance populates the next stage, so click him through.
  if (g.dave) {
    if (g.dave.msgIndex !== -1) { await clickAt(400, 300); return; }
    await sleep(rand(150, 350)); // leaving walk-off: nothing to press yet
    return;
  }
  if (g.selSeed >= 0 || g.selConvIdx >= 0 || g.shovelMode) { await cancelHold(); return; } // bank/shovel never used here
  // The award seed ends the level — take it first.
  {
    const award = b.coins.find((c) => !c.collected && !c.dead && typeof c.x === "number" &&
      typeof c.isAward === "function" && c.isAward());
    if (award) { const p = coinClickPoint(b, award); await clickAt(p.x, p.y); return; }
  }
  // Holding a usable seed: commit it to its cell (re-proved after the trip,
  // like the bank hold branch — the lawn moves under the hand).
  if (g.selUsable) {
    if (g.selUsable.coin.dead) { await cancelHold(); return; } // blinked out in hand: drop the stale link
    const seed = g.selUsable.seed;
    const cell = vasePlantCell(b, seed, rows);
    if (!cell) { await cancelHold(); return; } // nowhere plantable: set it back down, retry as the lawn changes
    const p = cellCenter(b, cell.c, cell.r);
    await moveTo(p.x + rand(-6, 6), p.y + rand(-6, 6));
    if (!G().selUsable) return; // lost under the hand: yield
    if (!b.canPlant(cell.c, cell.r, seed, true)) return; // keep holding, retry next think
    await pressAt();
    if (G().selUsable) await cancelHold(); // still holding: set it down, reconsider
    else { clearPlaceBansFor(seed); bot.lastPlantAt = performance.now(); }
    return;
  }
  // Resting usable seeds: lift the most useful one (single pickup per think).
  {
    const rest = vaseRestingCoins(b);
    if (rest.length) {
      const seed = vasePickCoin(b, rows, rest);
      if (seed >= 0) {
        const c = rest.filter((q) => q.seed === seed)
          .sort((a, c2) => (a.disappear | 0) - (c2.disappear | 0))[0] || rest[0];
        const p = coinClickPoint(b, c);
        await clickAt(p.x, p.y);
        return;
      }
      await sleep(rand(120, 240)); // packets resting but nowhere plantable yet: wait on the game
      return;
    }
  }
  // Nothing to plant: break the next vase while it's safe.
  if (vaseSafeToBreak(b)) {
    const v = vaseBreakTarget(b);
    if (v) {
      const p = cellCenter(b, v.col, v.row);
      await clickAt(p.x, p.y);
      return;
    }
  }
  await moveTo(rand(350, 450), rand(500, 560)); // hold position while the mallet swings / the lawn settles
}

// ---- main loop ----
async function think() {
  if (!bot.running || bot.busy) return;
  bot.busy = true;
  try {
    const g = G();
    if (g.pauseDlg) { await sleep(rand(120, 250)); return; } // dialog open: wait on the game
    if (g.screen !== "board") bot.urg = 0; // panic only applies mid-level
    switch (g.screen) {
      case "title": await sleep(rand(150, 300)); return; // auto-advances
      case "menu":
        if (g.userPopup === "list") await actListPopup();
        else await actMenu();
        return;
      case "cutscene": {
        const cs = g.cutscene;
        if (cs && cs.waitingForSeeds && g.chooser) await actChooser();
        else await actCutscene();
        return;
      }
      case "board": {
        const b = g.board;
        if (!b) return;
        bot.urg = b.isWhack ? whackUrgency(b) : urgency(b); // hands speed up as the horde closes in
        if ((b.state === "lost" || b.state === "won") && b.ended) {
          if (b.state === "lost") {
            const k = `${b.level}`;
            bot.losses[k] = (bot.losses[k] || 0) + 1;
            say(`lost L${b.level} (attempt ${bot.losses[k]}), retrying`);
            await clickAt(400, 300); // back to menu
          }
          return;
        }
        await (b.isWhack ? actWhack(b) : b.isVase ? actVase(b) : actBoard());
        return;
      }
      case "award": {
        const cur = SAVE.currentUser();
        const lv = (cur || {}).level || 1;
        if (lv !== bot.lastAwardLv) {
          bot.lastAwardLv = lv;
          say(`cleared a level (profile now ${lv})`);
        }
        if (lv > bot.stopLevel) {
          say(`adventure 1-${bot.stopLevel} done — stopping`);
          stop();
          return;
        }
        await actAward();
        return;
      }
      default: return;
    }
  } catch (e) {
    say(`think error: ${String(e && e.message || e).slice(0, 120)}`);
  } finally {
    bot.busy = false;
  }
}
export function start() {
  if (bot.running) return false;
  bot.running = true; bot.urg = 0;
  say("bot started — good luck, brains");
  // Self-scheduling loop (no overlap: the next think waits for this one).
  // No forced waits between actions: the loop re-fires the moment the last
  // motion finishes, so reactions are as fast as the hand can travel.
  const loop = () => {
    if (!bot.running) return;
    bot.timer = setTimeout(async () => {
      if (!bot.running) return;
      await think();
      if (!bot.running) return;
      loop();
    }, 0);
  };
  loop();
  return true;
}
export function stop() {
  bot.running = false;
  bot.busy = false; bot.urg = 0;
  if (bot.timer) clearTimeout(bot.timer);
  if (bot._rej) clearTimeout(bot._rej);
  bot.timer = null;
  say("bot stopped");
}
export function toggleBot() {
  if (bot.running) { stop(); return "stopped"; }
  start();
  return "started";
}
export function status() {
  const g = G();
  return {
    running: bot.running,
    screen: g.screen,
    level: g.board?.level ?? SAVE.currentUser()?.level ?? null,
    sun: g.board?.sun ?? null,
    plants: g.board ? g.board.allPlants().length : null,
    zombies: g.board ? g.board.zombies.filter((z) => !z.dead && !z.gone).length : null,
    urg: +(bot.urg || 0).toFixed(2),
    log: bot.log.slice(-10),
  };
}
window.__pvz.bot = {
  start, stop, toggle: toggleBot, status, _bot: bot,
  // Test/staging probes (pure functions of board state, no clicks).
  debug: {
    decidePickup, placeableCell, pickGun, bestShooter, rowShooters, rowNeedsGun, rowPressure, weakestRow,
    playableRows, cherryTarget, cherryVictims, potatoCell, earlyGame, sunflowerCell, shooterCell,
    nutCell, cellForSeed, chomperCell, pickConvSeed, convPacketReady, convPacketLiftable, graveCell, bowlingCell,
    chooserWantList, chooserWantNight, boardNight, levelRoster, levelGraves, sunCount, mineCol, tangleCol, POTATO_MIN_COL,
    rowHasMower, doorWindow, rowKillPower, zThreat, leadFoe, mineCoveredIds,
    whackFoes, whackPickup, whackUrgency, bonksToKill, poolLilyCell, isPoolTile, hasLiveLily, lilyInstead, lilyNeededAt,
    tangleTarget, tangleCell, seaCell, squashCell, bareWaterEmpty,
    isFog, foeVisible, fogDensityAt, rowHasSeed, planternCell, planternFogValue, bloverCell,
    upgradeTarget, UPGRADES, UPGRADE_IDLE_MS, UPGRADE_RESERVE,
    vaseLiveZombies, vaseRestingCoins, vaseEmergency, vaseWantsShooter, vaseBackCell, vaseHypnoFallback,
    vasePlantCell, vasePickCoin, vaseSafeToBreak, vaseBreakTarget,
  },
};
