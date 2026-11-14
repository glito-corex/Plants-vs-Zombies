// Asset loading: verbatim images + built reanim atlases/JSON. Mirrors the game's.
// resource system (LawnApp resource loading + ReanimatorCache pre-rendered frames).
import { ReanimDef, Reanimation, LOOP } from "./reanim.js";

export const V = "v28"; // bump to defeat stale caches after rebuilding data
const imgCache = new Map();
export function loadImage(path) {
  const key = path + "?" + V;
  if (imgCache.has(key)) return imgCache.get(key);
  const p = new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("img " + path));
    img.src = key;
  });
  imgCache.set(key, p);
  return p;
}
export async function loadImages(list, dir = "src/assets/images/") {
  const out = {};
  await Promise.all(list.map(async (f) => { out[f] = await loadImage(dir + f).catch(() => null); }));
  return out;
}

const defCache = new Map();
export async function getReanim(name) {
  if (defCache.has(name)) return defCache.get(name);
  const p = (async () => {
    const [json, atlas] = await Promise.all([
      fetch(`src/assets/reanim/${name}.json?${V}`).then((r) => r.json()),
      loadImage(`src/assets/atlas/${name}.png`),
    ]);
    let rects = {};
    try { rects = await fetch(`src/assets/atlas/${name}.map.json?${V}`).then((r) => r.json()); } catch (e) { /* no map */ }
    return new ReanimDef(json, atlas, new Map(Object.entries(rects)));
  })();
  defCache.set(name, p);
  return p;
}
export function makeReanim(def, x, y) { return new Reanimation(def, x, y); }

// Pre-rendered plant stills for seed packets (game: ReanimatorCache::DrawCachedPlant).
// Renders body (+attached head) at a fixed pose into a 120x120 canvas.
const stillCache = new Map();
export async function plantStill(seed, plantDef) {
  const key = plantDef.reanim;
  if (stillCache.has(key)) return stillCache.get(key);
  const p = (async () => {
    const def = await getReanim(plantDef.reanim);
    const cv = document.createElement("canvas");
    cv.width = 120; cv.height = 120;
    const ctx = cv.getContext("2d");
    const body = new Reanimation(def, 20, 8);
    const layer = plantDef.idle || "anim_idle";
    if (body.trackExists(layer)) body.playReanim(layer, LOOP, 0, def.fps);
    body.animTime = 0.3;
    const headSpecs = plantDef.heads || (plantDef.head ? [{ play: plantDef.head, on: plantDef.stem || "anim_stem" }] : []);
    const heads = [];
    for (const sp of headSpecs) {
      if (!body.trackExists(sp.on)) continue;
      const head = new Reanimation(def, 20, 8);
      if (!head.trackExists(sp.play)) continue;
      head.playReanim(sp.play, LOOP, 0, def.fps);
      head.animTime = 0.3;
      head.attachTo(body, sp.on);
      heads.push(head);
    }
    // Heads render inline during body.draw via the attachment (source:
    // DrawRenderGroup) — a single draw, no separate head.draw calls. Pumpkin
    // shells (Plant::PlantInitialize 378-385) carry their back half on render
    // group 1, so it draws first like the lone-shell pass (other defs have no
    // such track and draw group 0 only).
    if (body.trackExists("Pumpkin_back")) body.draw(ctx, 0, 0, 1);
    body.draw(ctx);
    return cv;
  })();
  stillCache.set(key, p);
  return p;
}
