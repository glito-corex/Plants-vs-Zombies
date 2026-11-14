// PopCap bitmap fonts (from main.zip data/*.txt + strip PNGs).
// Main strips are white glyphs on an OPAQUE BLACK background, so at load they
// are converted to white RGB + alpha=luminance (matching the engine, which
// colorizes the white art with the draw color). Outline strips are black
// glyphs on transparency; they draw in the outline color (black everywhere we
// use them). Both layers share the same CharList/WidthList/RectList/OffsetList,
// so one metric table drives both blits, outline first, main on top.
// Sexy DrawString y = BASELINE (ImageFont::DrawStringEx 1570-1571): glyph X =
// pen + layerOffsetX + charOffsetX, glyph TOP = baseline - (ascent -
// layerOffsetY - charOffsetY). None of the data/*.txt fonts use LayerSetOffset,
// so layer offsets are (0,0) and placement is pen + off[0] / baseline - ascent
// + off[1]. Advance = width only; space uses the font's space width. Missing
// glyphs (e.g. stars, em-dashes from our own UI strings) are folded to ASCII
// so nothing vanishes.
import { loadImage } from "./assets.js";

const REGISTRY = {
  HoT28:      { json: "HouseofTerror28.json",  main: "HouseofTerror28.png",  outline: "HouseofTerror28Outline.png" },
  HoT16:      { json: "HouseofTerror16.json",  main: "HouseofTerror16.png",  outline: "HouseofTerror16Outline.png" },
  HoT20:      { json: "HouseofTerror20.json",  main: "HouseofTerror20.png",  outline: "HouseofTerror20Outline.png" },
  CB14:       { json: "ContinuumBold14.json",  main: "ContinuumBold14.png",  outline: null },
  CB14OUT:    { json: "ContinuumBold14Outline.json", main: "ContinuumBold14Outline.png", outline: null },
  PICO:       { json: "Pico129.json",          main: "Pico129.png",          outline: null },
  DWARF12:    { json: "DwarvenTodcraft12.json", main: "DwarvenTodcraft12.png", outline: null },
  DWARF18:    { json: "DwarvenTodcraft18.json", main: "DwarvenTodcraft18.png", outline: "DwarvenTodcraft18Outline.png" },
  DWARF24:    { json: "DwarvenTodcraft24.json", main: "DwarvenTodcraft24.png", outline: "DwarvenTodcraft24Outline.png" },
  BRIANNE12:  { json: "BrianneTod12.json",     main: "BrianneTod12.png",     outline: null },
  BRIANNE16:  { json: "BrianneTod16.json",     main: "BrianneTod16.png",     outline: null },
  BRIANNE32:  { json: "BrianneTod32.json",     main: "BrianneTod32.png",     outline: "BrianneTod32Outline.png" },
  PIX:        { json: "Pix118Bold.json",        main: "Pix118Bold.gif",       outline: null },
};
// Source-name aliases for fonts with no art of their own in the zip:
// DWARVENTODCRAFT15 reuses the HouseofTerror16 strips (its .txt points there);
// the 18 colour variants reuse the DwarvenTodcraft18 strips (tint decides);
// BRIANNETOD32BLACK is BrianneTod32 drawn black.
const ALIAS = {
  DWARF15: "HoT16", DWARF18YELLOW: "DWARF18", DWARF18GREEN: "DWARF18",
  DWARF18BRIGHT: "DWARF18", BRIANNE32BLACK: "BRIANNE32",
};

export const Fonts = {}; // key -> {space, ascent, lineH, chars, mainCv, outCv, tints:Map}
const DIR = "src/assets/fonts/";
const FOLD = { "—": "-", "–": "-", "―": "-", "★": "*", "…": "...", "‘": "'", "’": "'", "“": '"', "”": '"', "×": "x", "•": "*" };
export function foldChar(ch) {
  if (ch === "\n" || ch === " ") return ch;
  if (FOLD[ch]) return FOLD[ch];
  return ch;
}

function prepMain(img) {
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const id = g.getImageData(0, 0, c.width, c.height), d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = Math.round((d[i] + d[i + 1] + d[i + 2]) / 3);
    d[i] = d[i + 1] = d[i + 2] = 255;
    d[i + 3] = lum;
  }
  g.putImageData(id, 0, 0);
  return c;
}
function prepOutline(img) {
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const id = g.getImageData(0, 0, c.width, c.height), d = id.data;
  for (let i = 0; i < d.length; i += 4) { d[i] = d[i + 1] = d[i + 2] = 255; }
  g.putImageData(id, 0, 0);
  return c;
}
function tinted(src, color) {
  const c = document.createElement("canvas");
  c.width = src.width; c.height = src.height;
  const g = c.getContext("2d");
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = "source-in";
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

export async function loadFonts() {
  const keys = Object.keys(REGISTRY);
  await Promise.all(keys.map(async (key) => {
    if (Fonts[key]) return;
    const r = REGISTRY[key];
    const meta = await fetch(DIR + r.json).then((x) => x.json());
    const mainImg = await loadImage(DIR + r.main);
    let outCv = null;
    if (r.outline) {
      try { outCv = prepOutline(await loadImage(DIR + r.outline)); } catch (e) { outCv = null; }
    }
    Fonts[key] = { ...meta, mainCv: prepMain(mainImg), outCv, tints: new Map() };
  }));
}
export function font(key) { return Fonts[ALIAS[key] || key]; }

function layerArt(f, color, isOutline) {
  const src = isOutline ? f.outCv : f.mainCv;
  if (!src) return null;
  const k = (isOutline ? "o:" : "m:") + color;
  let t = f.tints.get(k);
  if (!t) { t = tinted(src, color); f.tints.set(k, t); }
  return t;
}

export function textWidth(key, text) {
  const f = font(key);
  if (!f) return 0;
  let w = 0;
  for (const raw of String(text)) {
    const ch = foldChar(raw);
    if (ch === "\n") continue;
    if (ch === " ") { w += f.space; continue; }
    const m = f.chars[ch];
    w += m ? m.adv : f.space;
  }
  return w;
}

// Draw one line; (x, y) = left/center/right anchor at the BASELINE.
// round=true snaps each glyph to whole pixels (crisp static text). Pass
// round:false for text that rides a moving/scaling surface (e.g. the cost
// on a flying award seed packet): per-glyph rounding would snap digits at
// different fractional thresholds while the packet art blits smoothly,
// making the number jitter against the packet.
export function drawText(ctx, key, text, x, y, { align = "left", color = "#fff", alpha = 1, outline = null, round = true } = {}) {
  const f = font(key);
  if (!f) return 0;
  const str = String(text);
  const total = textWidth(key, str);
  let pen = align === "center" ? x - total / 2 : align === "right" ? x - total : x;
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = prevAlpha * alpha;
  const main = layerArt(f, color, false);
  const out = f.outCv ? layerArt(f, outline || "#000", true) : null;
  for (const raw of str) {
    const ch = foldChar(raw);
    if (ch === " ") { pen += f.space; continue; }
    const m = f.chars[ch];
    if (!m) { continue; }
    const [rx, ry, rw, rh] = m.rect;
    const dx = round ? Math.round(pen + m.off[0]) : pen + m.off[0];
    const dy = round ? Math.round(y - f.ascent + m.off[1]) : y - f.ascent + m.off[1];
    if (out) ctx.drawImage(out, rx, ry, rw, rh, dx, dy, rw, rh);
    ctx.drawImage(main, rx, ry, rw, rh, dx, dy, rw, rh);
    pen += m.adv;
  }
  ctx.globalAlpha = prevAlpha;
  return total;
}

// Wrapped paragraph in a rect (TodDrawStringWrapped subset): word-wraps at
// rect width, horizontal align + vertical top/middle anchor.
export function drawWrapped(ctx, key, text, rx, ry, rw, rh, { color = "#fff", alpha = 1, outline = null, align = "center", valign = "middle" } = {}) {
  const f = font(key);
  if (!f) return;
  // Preserve explicit newlines: wrap each source line at the rect width.
  const finalLines = [];
  for (const ln of String(text).split("\n")) {
    const sub = [];
    let c = "";
    for (const w of ln.split(/\s+/).filter((w) => w.length)) {
      const t = c ? c + " " + w : w;
      if (textWidth(key, t) > rw && c) { sub.push(c); c = w; }
      else c = t;
    }
    if (c) sub.push(c);
    if (!sub.length) sub.push("");
    for (const s of sub) finalLines.push(s);
  }
  const list = finalLines;
  const totalH = list.length * f.lineH;
  const firstBase = valign === "middle" ? ry + (rh - totalH) / 2 + f.ascent : ry + f.ascent;
  list.forEach((ln, i) => {
    const bx = align === "center" ? rx + rw / 2 : align === "right" ? rx + rw : rx;
    drawText(ctx, key, ln, bx, firstBase + i * f.lineH, { align, color, alpha, outline });
  });
}
