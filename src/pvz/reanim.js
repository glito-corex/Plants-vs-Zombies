// Translated from the decompilation source:
//   Sexy.TodLib/Reanimator.cpp — Reanimation::Update / GetFrameTime /
//     GetTransformAtTime / GetCurrentTransform / MatrixFromTransform /
//     DrawTrack / PlayReanim / SetFramesForLayer / GetFramesForLayer /
//     StartBlend / BlendTransform / GetTrackVelocity / FindTrackIndex
//   Sexy.TodLib/Definition.cpp — ReanimationLoadDefinition fill-in-missing-data
//     (already applied by the atlas builder; JSON holds complete frames)
// secular constants: SECONDS_PER_UPDATE = 0.01 (100 ticks/sec, Reanimator.h)
//
// Canvas mapping: SexyMatrix3 (m00,m10,m20 / m01,m11,m21 / m02,m12,m22) is
// column-vector; canvas setTransform(a,b,c,d,e,f) matches with
// a=m00 b=m10 c=m01 d=m11 e=m02 f=m12.

import { LOOP, LOOP_FULL_LAST_FRAME, PLAY_ONCE, PLAY_ONCE_AND_HOLD, PLAY_ONCE_FULL_LAST_FRAME, PLAY_ONCE_FULL_LAST_FRAME_AND_HOLD, RENDER_GROUP_HIDDEN } from "./enums.js";
export { LOOP, LOOP_FULL_LAST_FRAME, PLAY_ONCE, PLAY_ONCE_AND_HOLD, PLAY_ONCE_FULL_LAST_FRAME, PLAY_ONCE_FULL_LAST_FRAME_AND_HOLD };

export const SECONDS_PER_UPDATE = 0.01;
const D2R = Math.PI / 180;
const roundInt = (v) => Math.floor(v + 0.5);

// JSON def shape (from atlas builder): { fps, tracks:[{name, t:[[x,y,skx,sky,scx,scy,frame,alpha,imgKey]]}] }
// frameMap: Map imgKey -> {img:HTMLImageElement, x,y,w,h} into the atlas PNG.
export class ReanimDef {
  constructor(json, atlasImage, frameMap) {
    this.fps = json.fps;
    this.atlas = atlasImage;
    this.images = frameMap; // IMAGE_* key -> {img-less rect} (for SetImageOverride)
    this.tracks = json.tracks.map((tr) => ({
      name: tr.name,
      frames: tr.t.map((a) => ({
        x: a[0], y: a[1], skx: a[2], sky: a[3], scx: a[4], scy: a[5],
        frame: a[6], alpha: a[7],
        key: typeof a[8] === "string" ? a[8] : null,
        rect: typeof a[8] === "string" ? frameMap.get(a[8]) || null : null,
      })),
    }));
  }
}

function makeTrackInstance() {
  return {
    blendCounter: 0, blendTime: 0, blend: null,
    // Reanimation::SetShakeOverride (Reanimator.cpp:4733F0) — the doom-shroom
    // fuse re-rolls RandRangeFloat(-mag, mag) into mShakeX/Y every tick
    // (Reanimator::Update, ~27430) and DrawTrack adds it to the draw
    // translation (T(shakeX + gTrans - 0.5), ~37726). Overrides may share a
    // name across several tracks (the doom def carries five head2 fragment
    // tracks), so setShakeOverride below writes ALL name matches.
    shakeMag: 0, shakeX: 0, shakeY: 0,
    imageOverride: null, renderGroup: 0, ignoreClip: false,
    truncate: true, ignoreColorOverride: false, ignoreExtraAdditiveColor: false,
    attachments: [], // child Reanimations bound via attachTo() (a track can host several — e.g. the 3 menu flowers all hang off SelectorScreen_BG_Right)
  };
}

const IDENTITY = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
function mulMat(l, r) {
  return {
    a: l.a * r.a + l.c * r.b, b: l.b * r.a + l.d * r.b,
    c: l.a * r.c + l.c * r.d, d: l.b * r.c + l.d * r.d,
    e: l.a * r.e + l.c * r.f + l.e, f: l.b * r.e + l.d * r.f + l.f,
  };
}
function invMat(m) {
  const det = m.a * m.d - m.b * m.c;
  if (Math.abs(det) < 1e-9) return { ...IDENTITY };
  const id = 1 / det;
  return {
    a: m.d * id, b: -m.b * id, c: -m.c * id, d: m.a * id,
    e: (m.c * m.f - m.d * m.e) * id, f: (m.b * m.e - m.a * m.f) * id,
  };
}

export class Reanimation {
  constructor(def, x = 0, y = 0) {
    this.def = def;
    this.x = x; this.y = y;
    this.dead = false;
    this.animTime = 0;
    this.animRate = def.fps;
    this.loopType = LOOP;
    this.loopCount = 0;
    this.frameStart = 0;
    this.frameCount = def.tracks.length ? def.tracks[0].frames.length : 0;
    this.lastFrameTime = -1;
    this.tracks = def.tracks.map(() => makeTrackInstance());
    this.overlay = { ...IDENTITY }; // mOverlayMatrix (set when attached to a parent track)
    this.flashMul = 0; // damage-flash second pass multiplier (set during draw)
    this.alpha = 1; // global opacity multiplier (Coin::GetColor fade/collect alpha)
    this.recoilTrack = null; // shield-track name for the TakeShieldDamage knockback
    this.recoilDx = 0; // +3->0px X shift while shieldRecoil runs down (sim sets both)
    this.sweepOrder = null; // optional track-index sweep order (default: definition order)
    this.frameBasePose = -1;        // mFrameBasePose
    this.renderOrder = 0;
    this.scaleX = 1; this.scaleY = 1; // OverrideScale (potato/coffee 0.8, mower 0.85)
  }
  setScale(sx, sy) { this.scaleX = sx; this.scaleY = sy === undefined ? sx : sy; }
  findTrackIndex(name) {
    const t = this.def.tracks;
    for (let i = 0; i < t.length; i++)
      if (t[i].name.toLowerCase() === name.toLowerCase()) return i;
    return 0;
  }
  trackExists(name) {
    return this.def.tracks.some((t) => t.name.toLowerCase() === name.toLowerCase());
  }
  // Reanimation::SetShakeOverride (Reanimator.cpp:4733F0, stricmp match):
  // writes every same-named track (see makeTrackInstance note).
  setShakeOverride(name, mag) {
    const want = name.toLowerCase();
    for (let i = 0; i < this.def.tracks.length; i++)
      if (this.def.tracks[i].name.toLowerCase() === want) this.tracks[i].shakeMag = mag;
  }
  // Zombie::ReanimIgnoreClipRect (Zombie.cpp:907): sets mIgnoreClipRect on
  // EVERY same-named track (stricmp loop) — a no-op when no track matches
  // (e.g. "Zombie_outerarm_hand"/"Zombie_innerarm3" in the base def).
  setIgnoreClipRect(name, on = true) {
    const want = name.toLowerCase();
    for (let i = 0; i < this.def.tracks.length; i++)
      if (this.def.tracks[i].name.toLowerCase() === want) this.tracks[i].ignoreClip = !!on;
  }
  // Zombie::SetupWaterTrack (Zombie.cpp:536EA0): like ReanimIgnoreClipRect but
  // through GetTrackInstanceByName (FindTrackIndex = FIRST stricmp match
  // only) — so "Zombie_whitewater2" flags only the first of the five
  // same-named tracks — plus the color-override exemptions (foam never takes
  // the chill/flash tint). The color flags ride along for documentation;
  // the canvas tint passes don't honor them yet (noted deviation).
  setupWaterTrack(name) {
    const want = name.toLowerCase();
    for (let i = 0; i < this.def.tracks.length; i++) {
      if (this.def.tracks[i].name.toLowerCase() === want) {
        this.tracks[i].ignoreClip = true;
        this.tracks[i].ignoreColorOverride = true;
        this.tracks[i].ignoreExtraAdditiveColor = true;
        return;
      }
    }
  }
  // Zombie::ReanimReenableClipping (Zombie.cpp:922): clears mIgnoreClipRect
  // on every track (color flags stay — source only resets the clip flag).
  reenableClipping() {
    for (const tr of this.tracks) tr.ignoreClip = false;
  }
  // ---- Reanimation::Update ----
  update() {
    if (this.frameCount === 0 || this.dead) return;
    this.lastFrameTime = this.animTime;
    this.animTime += (SECONDS_PER_UPDATE * this.animRate) / this.frameCount;
    if (this.animRate > 0) {
      switch (this.loopType) {
        case LOOP: case LOOP_FULL_LAST_FRAME:
          while (this.animTime >= 1) { this.loopCount++; this.animTime -= 1; }
          break;
        case PLAY_ONCE: case PLAY_ONCE_FULL_LAST_FRAME:
          if (this.animTime >= 1) { this.loopCount = 1; this.animTime = 1; this.dead = true; }
          break;
        case PLAY_ONCE_AND_HOLD: case PLAY_ONCE_FULL_LAST_FRAME_AND_HOLD:
          if (this.animTime >= 1) { this.loopCount = 1; this.animTime = 1; }
          break;
      }
    } else {
      switch (this.loopType) {
        case LOOP: case LOOP_FULL_LAST_FRAME:
          while (this.animTime < 0) { this.loopCount++; this.animTime += 1; }
          break;
        case PLAY_ONCE: case PLAY_ONCE_FULL_LAST_FRAME:
          if (this.animTime < 0) { this.loopCount = 1; this.animTime = 0; this.dead = true; }
          break;
        case PLAY_ONCE_AND_HOLD: case PLAY_ONCE_FULL_LAST_FRAME_AND_HOLD:
          if (this.animTime < 0) { this.loopCount = 1; this.animTime = 0; }
          break;
      }
    }
    for (const tr of this.tracks) if (tr.blendCounter > 0) tr.blendCounter--;
    for (const tr of this.tracks) {
      if (tr.shakeMag) {
        tr.shakeX = Math.random() * 2 * tr.shakeMag - tr.shakeMag;
        tr.shakeY = Math.random() * 2 * tr.shakeMag - tr.shakeMag;
      }
    }
    // Source Reanimation::Update refreshes every attached child's overlay
    // matrix here (AttachmentUpdateAndSetMatrix), so detachable children
    // (menu flowers) ride the parent track even between draws. The draw
    // sweep re-refreshes too (idempotent) for poses set without update().
    for (let i = 0; i < this.tracks.length; i++) {
      if ((this.tracks[i].attachments || []).length) this.updateAttachment(i);
    }
  }
  // ---- Reanimation::PlayReanim ----
  playReanim(name, loopType, blendTime, animRate) {
    if (blendTime > 0) this.startBlend(blendTime);
    if (animRate !== 0) this.animRate = animRate;
    this.loopType = loopType;
    this.loopCount = 0;
    this.setFramesForLayer(name);
  }
  // ---- Reanimation::StartBlend ----
  startBlend(blendTime) {
    for (let i = 0; i < this.def.tracks.length; i++) {
      const cur = this.getCurrentTransform(i);
      if (roundInt(cur.frame) >= 0) {
        const inst = this.tracks[i];
        inst.blend = { ...cur };
        inst.blendTime = blendTime;
        inst.blendCounter = blendTime;
      }
    }
  }
  // ---- GetFramesForLayer / SetFramesForLayer ----
  getFramesForLayer(name) {
    if (!this.def.tracks.length) return { start: 0, count: 0 };
    const tr = this.def.tracks[this.findTrackIndex(name)];
    let start = 0, count = 1;
    for (let i = 0; i < tr.frames.length; i++)
      if (tr.frames[i].frame >= 0) { start = i; break; }
    for (let j = start; j < tr.frames.length; j++)
      if (tr.frames[j].frame >= 0) count = j - start + 1;
    return { start, count };
  }
  setFramesForLayer(name) {
    this.animTime = this.animRate >= 0 ? 0 : 0.9999999;
    this.lastFrameTime = -1;
    const { start, count } = this.getFramesForLayer(name);
    this.frameStart = start; this.frameCount = count;
  }
  // ---- Reanimation::GetFrameTime ----
  getFrameTime() {
    let n;
    if (this.loopType === PLAY_ONCE_FULL_LAST_FRAME || this.loopType === LOOP_FULL_LAST_FRAME || this.loopType === PLAY_ONCE_FULL_LAST_FRAME_AND_HOLD)
      n = this.frameCount;
    else n = this.frameCount - 1;
    const pos = this.frameStart + this.animTime * n;
    const before = Math.floor(pos);
    let bi = before, ai;
    if (bi >= this.frameStart + this.frameCount - 1) { bi = this.frameStart + this.frameCount - 1; ai = bi; }
    else ai = bi + 1;
    return { fraction: pos - before, before: bi, after: ai };
  }
  // ---- Reanimation::GetTransformAtTime (+ GetCurrentTransform w/ blend) ----
  getTransformAtTime(idx, ft) {
    const fr = this.def.tracks[idx].frames;
    const a = fr[ft.before], b = fr[ft.after], f = ft.fraction;
    const lerp = (u, v) => u + (v - u) * f;
    let frame;
    if (a.frame !== -1 && b.frame === -1 && f > 0 && this.tracks[idx].truncate) frame = -1;
    else frame = a.frame;
    return {
      x: lerp(a.x, b.x), y: lerp(a.y, b.y),
      skx: lerp(a.skx, b.skx), sky: lerp(a.sky, b.sky),
      scx: lerp(a.scx, b.scx), scy: lerp(a.scy, b.scy),
      alpha: lerp(a.alpha, b.alpha), rect: a.rect, frame, key: a.key,
    };
  }
  getCurrentTransform(idx) {
    const ft = this.getFrameTime();
    const t = this.getTransformAtTime(idx, ft);
    const inst = this.tracks[idx];
    if (roundInt(t.frame) >= 0 && inst.blendCounter > 0 && inst.blend) {
      const k = inst.blendCounter / inst.blendTime;
      const s = inst.blend;
      let skx2 = s.skx, sky2 = s.sky;
      // port of the decomp's skew-wrap (clamps to source side past 180deg)
      while (skx2 > t.skx + 180) skx2 = t.skx;
      while (skx2 < t.skx - 180) skx2 = t.skx;
      while (sky2 > t.sky + 180) sky2 = t.sky;
      while (sky2 < t.sky - 180) sky2 = t.sky;
      const lerp = (u, v) => u + (v - u) * k;
      return {
        x: lerp(t.x, s.x), y: lerp(t.y, s.y),
        skx: lerp(t.skx, skx2), sky: lerp(t.sky, sky2),
        scx: lerp(t.scx, s.scx), scy: lerp(t.scy, s.scy),
        // The blend only interpolates the transform — the cel identity rides
        // through unchanged, so image-keyed passes (production glow filter)
        // keep matching the same cel the normal pass draws. Dropping it here
        // blanked the whole glow coat for the blend's duration (the dance
        // in/out crossfade), reading as the glow winking out and back.
        alpha: lerp(t.alpha, s.alpha), rect: t.rect, frame: t.frame, key: t.key,
      };
    }
    return t;
  }
  // ---- Reanimation::MatrixFromTransform (canvas a/b/c/d/e/f form) ----
  static matrixFrom(t) {
    const ax = -t.skx * D2R, ay = -t.sky * D2R;
    return {
      a: Math.cos(ax) * t.scx, b: -Math.sin(ax) * t.scx,
      c: Math.sin(ay) * t.scy, d: Math.cos(ay) * t.scy,
      e: t.x, f: t.y,
    };
  }
  // ---- Reanimation::DrawTrack + DrawRenderGroup (source shape, exactly) ----
  // The attachment draws whenever its track is in the render group —
  // REGARDLESS of whether the track itself drew anything (source:
  // DrawRenderGroup calls AttachmentDraw even when DrawTrack returns false;
  // the bool only feeds the child's hidden flag). Marker tracks like
  // anim_stem are usually blank, so gating on them made heads pop in/out.
  drawTrack(ctx, i, camX, camY, filter = null) {
    const inst = this.tracks[i];
    const t = this.getCurrentTransform(i);
    if (roundInt(t.frame) < 0) return false;
    // Additive glow passes may restrict to a track subset (e.g. the
    // sunflower production glow covers the flower head only, not the
    // stem/leaves). The normal pass (flashMul 0) always draws everything.
    if (this.flashMul > 0 && filter && !filter(this.def.tracks[i].name, t.key)) return false;
    const r = inst.imageOverride || t.rect;
    if (!r) return false;
    const alpha = Math.max(0, Math.min(255, roundInt(t.alpha * 255)));
    if (alpha <= 0) return false;
    const F = Reanimation.matrixFrom(t);
    // Source DrawTrack (Reanimator.cpp:686-715), exactly:
    //   aMatrix = T(cel/2); aMatrix = F * aMatrix; aMatrix = O * aMatrix;
    //   aMatrix = T(shake + gTrans - 0.5) * aMatrix; quad is CENTERED.
    // So M = T(pos) * B * T(cel/2) with B = O_eff * F, where O_eff folds the
    // reanim-local OverrideScale in exactly like source (it writes O.m00/m11,
    // scaling the track translation too). Basis order matters (O*F, not F*O)
    // and the cel/2 offset is scaled/rotated by B, not added raw.
    const o = this.overlay;
    const sx = this.scaleX, sy = this.scaleY;
    // O_eff = S * O
    const oa = sx * o.a, ob = sx * o.b, oc = sy * o.c, od = sy * o.d;
    const oe = sx * o.e, of = sy * o.f;
    // B = O_eff * F (full affine, translation included)
    const Ba = oa * F.a + oc * F.b, Bb = ob * F.a + od * F.b;
    const Bc = oa * F.c + oc * F.d, Bd = ob * F.c + od * F.d;
    const Be = oa * F.e + oc * F.f + oe, Bf = ob * F.e + od * F.f + of;
    const cx = r.w / 2, cy = r.h / 2;
    // Shield recoil (Zombie::DrawReanim 5682-5690): the SHIELD pass draws at
    // +3->0px X while mShieldRecoilCounter runs down. The sim tags the shield
    // track + per-tick offset; only that track shifts (door arms don't).
    const rdx = (this.recoilTrack && this.def.tracks[i].name === this.recoilTrack) ? this.recoilDx : 0;
    // Reanimation shake override (DrawTrack ~37726): T(shakeX + gTrans - 0.5).
    const ex = Ba * cx + Bc * cy + Be + camX + this.x - 0.5 + rdx + inst.shakeX;
    const ey = Bb * cx + Bd * cy + Bf + camY + this.y - 0.5 + inst.shakeY;
    ctx.globalAlpha = (alpha / 255) * (this.flashMul > 0 ? this.flashMul : 1) * this.alpha;
    ctx.setTransform(Ba, Bb, Bc, Bd, ex, ey);
    ctx.drawImage(this.def.atlas, r.x, r.y, r.w, r.h, -cx, -cy, r.w, r.h);
    return true;
  }
  // Track sweep shared by both passes: draws this reanim's tracks plus
  // attachments RECURSIVELY at one multiplier, touching no canvas state
  // (no save/restore, no composite-op). draw() calls it twice — once normal,
  // once additively — so every cel is drawn exactly 1+1 times. (The old code
  // recursed through the public draw() for attachments, whose normal pass
  // ran UNDER the outer "lighter" op — attached heads were blitted a second
  // time additively at FULL alpha, which is why plant heads glowed neon.)
  drawTracks(ctx, mul, camX, camY, group = 0, filter = null, clipRect = null) {
    const def = this.def;
    this.flashMul = mul;
    // Sweep order is definition order unless sendTrackBefore() re-sequenced
    // it (same positions/frames — only paint order changes).
    const seq = this.sweepOrder || def.tracks.map((_, i) => i);
    for (let s = 0; s < seq.length; s++) {
      const i = seq[s];
    const inst = this.tracks[i];
      if (inst.renderGroup !== group) continue;
      // Zombie::DrawTrack clip bypass (Reanimator.cpp): tracks with
      // mIgnoreClipRect draw under a full-board clip instead of the
      // DrawReanim waterline/rise window. Canvas clips only intersect, so
      // the window is applied per-track here: normal tracks draw inside a
      // save/clip/restore, exempt tracks draw straight through.
      // NOTE: the clip rect is absolute canvas pixels, so the transform is
      // reset to identity before clip() — a leftover per-track setTransform
      // would otherwise send the window (or empty it) through the wrong
      // matrix. drawTrack installs its own transform after; the clip itself
      // is device-space and survives that.
      let shown;
      if (clipRect && !inst.ignoreClip) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.beginPath();
        ctx.rect(clipRect[0], clipRect[1], clipRect[2], clipRect[3]);
        ctx.clip();
        shown = this.drawTrack(ctx, i, camX, camY, filter);
        ctx.restore();
      } else {
        shown = this.drawTrack(ctx, i, camX, camY, filter);
      }
      const kids = inst.attachments || [];
      if (kids.length) {
        this.updateAttachment(i);
        // game: AttachmentDraw draws the child right after its track; the
        // child's mDontDrawIfParentHidden (e.g. Zomboss driver) hides it
        // when the parent track itself drew nothing.
        // Menu flowers attach for POSITION only (AttachToAnotherReanimation)
        // but draw independently in DrawOverlay (overlayOnly) — never inline.
        // The waterline/rise clip rides into the child: it draws under the
        // same window, with its own tracks' mIgnoreClipRect honored.
        for (const c of kids) {
          // noCoat children (attached seaweed): retail attached particle
          // systems render outside DrawReanim's color/flash overrides, so
          // they skip every tinted/additive coat (mul > 0) and paint only in
          // the normal pass — the tint paths redraw them straight afterwards.
          // _tintHidden children (attached seaweed during a chilled/mind/burn
          // scratch render): hidden here so the whole-canvas tint never touches
          // them — drawSeaweed repaints them straight afterwards.
          if (!c.overlayOnly && !c._tintHidden && !(mul > 0 && c.noCoat) && (shown || !c.hideWithParent)) c.drawTracks(ctx, mul, camX, camY, 0, filter, clipRect);
        }
      }
    }
    this.flashMul = 0;
  }
  draw(ctx, camX = 0, camY = 0, group = 0, flash = 0, flash2 = 0, flash2Filter = null, flashFilter = null, clipRect = null) {
    if (this.dead) return;
    // Save/restore (not reset-to-identity): callers may have a live ambient
    // transform (e.g. the cutscene board pan) that later drawImages rely on.
    // Tracks still compute absolute transforms via setTransform; camX/camY
    // shift every track including attachments (each level adds it once —
    // nothing inherits through the canvas transform).
    // clipRect (Zombie::DrawReanim 5574-5578 waterline/rise window) is
    // enforced per-track inside drawTracks so mIgnoreClipRect tracks (tube,
    // foam, hands) draw straight through it.
    ctx.save();
    this.drawTracks(ctx, 0, camX, camY, group, null, clipRect);
    // Damage flash (Zombie::DrawReanim 5630, Plant::Draw 4131): the art redrawn
    // additively UNCHANGED (no whitening — source tints the second pass with a
    // gray color, so features stay visible while brightness ~doubles at full
    // counter and fades to nothing). Canvas "lighter" + globalAlpha matches
    // Sexy's DRAWMODE_ADDITIVE-with-color exactly: dst += src * flash.
    // flash2 is a second additive coat restricted to flash2Filter tracks
    // (sunflower production glow = flower head only, stem/leaves stay matte).
    // flashFilter is an inclusion filter for the MAIN flash coat (null = all
    // tracks) — lets callers split the flash: e.g. zombie bodies flash full
    // strength additively while the armor tracks are excluded (they take a
    // blend-toward-white coat in main.js instead, which never clips).
    if (flash > 0 || flash2 > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      if (flash > 0) this.drawTracks(ctx, Math.min(1, flash), camX, camY, group, flashFilter, clipRect);
      if (flash2 > 0) this.drawTracks(ctx, Math.min(1, flash2), camX, camY, group, flash2Filter, clipRect);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  // ---- Reanimation::GetTrackVelocity ("_ground") ----
  getTrackVelocity(name) {
    const ft = this.getFrameTime();
    const idx = this.findTrackIndex(name);
    const fr = this.def.tracks[idx].frames;
    const dis = fr[ft.after].x - fr[ft.before].x;
    return dis * SECONDS_PER_UPDATE * this.animRate;
  }
  isTrackShowing(name) {
    const ft = this.getFrameTime();
    const fr = this.def.tracks[this.findTrackIndex(name)].frames;
    return fr[ft.after].frame >= 0;
  }
  // Union bottom edge (board space) of the currently visible tracks —
  // the plant's feet line. Used by Plant.squish() so the 0.25 flatten
  // keeps the feet planted: squashShiftY = feetBelowOrigin * 0.75, which
  // is exactly retail's flat 60px drop for a standard 80px-tall plant
  // (Plant::Draw squished branch 3991-4004 draws the cached frame at
  // 60.0f + aOffsetY under SetScale(1, 0.25) about the grid corner, so
  // the feet stay at the same screen Y). Same visibility rules as
  // poseComposite/drawTrack. Returns null when nothing shows.
  visibleBottom() {
    let bottom = -1e9;
    for (let i = 0; i < this.def.tracks.length; i++) {
      const inst = this.tracks[i];
      if (inst.renderGroup === RENDER_GROUP_HIDDEN) continue;
      const t = this.getCurrentTransform(i);
      if (roundInt(t.frame) < 0) continue;
      const r = inst.imageOverride || t.rect;
      if (!r) continue;
      const o = this.overlay, sx = this.scaleX, sy = this.scaleY;
      const oa = sx * o.a, ob = sx * o.b, oc = sy * o.c, od = sy * o.d;
      const oe = sx * o.e, of = sy * o.f;
      const F = Reanimation.matrixFrom(t);
      const Bb = ob * F.a + od * F.b, Bd = ob * F.c + od * F.d;
      const Bf = ob * F.e + od * F.f + of;
      const cx = r.w / 2, cy = r.h / 2;
      const ey = Bb * cx + Bd * cy + Bf + this.y - 0.5 + (inst.shakeY || 0);
      const hh = (Math.abs(Bb) * r.w + Math.abs(Bd) * r.h) / 2;
      if (ey + hh > bottom) bottom = ey + hh;
    }
    return bottom <= -1e8 ? null : bottom;
  }
  // ---- posed-limb capture for flying debris ----
  // Render the listed tracks (exact names, case-insensitive, all matches) at
  // their CURRENT pose into an offscreen canvas. Retail's head/arm particles
  // use standalone full-limb sprites (IMAGE_ZOMBIEHEAD etc., DropHead 3427 /
  // DropArm 3710 + per-type OverrideImage) which our atlases don't carry — so
  // the debris is the limb exactly as posed on the body: the full near-side
  // arm (upper+lower+hand, not just the hand) and the whole head
  // (head1 skull + head2 jaw, not the skull alone). Captured BEFORE the
  // caller hides the tracks. Skips hidden tracks and frame<0 tracks exactly
  // like drawTrack. Returns {img, cx, cy, x, y}: pivot in canvas px + the
  // union-center in board space (the debris spawn point), or null.
  poseComposite(names) {
    const quads = [];
    const o = this.overlay, sx = this.scaleX, sy = this.scaleY;
    const oa = sx * o.a, ob = sx * o.b, oc = sy * o.c, od = sy * o.d;
    const oe = sx * o.e, of = sy * o.f;
    for (const n of names) {
      const low = String(n).toLowerCase();
      for (let i = 0; i < this.def.tracks.length; i++) {
        if (this.def.tracks[i].name.toLowerCase() !== low) continue;
        const inst = this.tracks[i];
        if (inst.renderGroup === RENDER_GROUP_HIDDEN) continue;
        const t = this.getCurrentTransform(i);
        if (roundInt(t.frame) < 0) continue;
        const r = inst.imageOverride || t.rect;
        if (!r) continue;
        const F = Reanimation.matrixFrom(t);
        const Ba = oa * F.a + oc * F.b, Bb = ob * F.a + od * F.b;
        const Bc = oa * F.c + oc * F.d, Bd = ob * F.c + od * F.d;
        const Be = oa * F.e + oc * F.f + oe, Bf = ob * F.e + od * F.f + of;
        const cx = r.w / 2, cy = r.h / 2;
        quads.push({
          r, Ba, Bb, Bc, Bd,
          ex: Ba * cx + Bc * cy + Be + this.x - 0.5,
          ey: Bb * cx + Bd * cy + Bf + this.y - 0.5,
          alpha: Math.max(0, Math.min(255, roundInt(t.alpha * 255))),
        });
      }
    }
    if (!quads.length) return null;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const q of quads) {
      const hw = q.r.w / 2, hh = q.r.h / 2;
      for (const [px, py] of [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]) {
        const X = q.ex + q.Ba * px + q.Bc * py, Y = q.ey + q.Bb * px + q.Bd * py;
        if (X < x0) x0 = X; if (X > x1) x1 = X;
        if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
      }
    }
    const pad = 2;
    x0 = Math.floor(x0) - pad; y0 = Math.floor(y0) - pad;
    const W = Math.ceil(x1) - x0 + pad * 2 + 2, H = Math.ceil(y1) - y0 + pad * 2 + 2;
    if (W <= 0 || H <= 0 || W > 512 || H > 512) return null;
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    for (const q of quads) {
      g.setTransform(q.Ba, q.Bb, q.Bc, q.Bd, q.ex - x0, q.ey - y0);
      g.globalAlpha = q.alpha / 255;
      g.drawImage(this.def.atlas, q.r.x, q.r.y, q.r.w, q.r.h, -q.r.w / 2, -q.r.h / 2, q.r.w, q.r.h);
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    const px = (x0 + x1) / 2, py = (y0 + y1) / 2;
    return { img: cv, cx: px - x0, cy: py - y0, x: px, y: py };
  }
  isAnimPlaying(name) {
    // port of IsAnimPlaying: true while a PLAY_ONCE anim hasn't finished/dead
    if (this.loopType === PLAY_ONCE || this.loopType === PLAY_ONCE_FULL_LAST_FRAME) return !this.dead;
    return true;
  }
  shouldTriggerTimedEvent(t) {
    return this.lastFrameTime < t && this.animTime >= t;
  }
  assignRenderGroupToPrefix(prefix, group) {
    const p = prefix.toLowerCase();
    this.def.tracks.forEach((tr, i) => {
      if (tr.name.toLowerCase().startsWith(p)) this.tracks[i].renderGroup = group;
    });
  }
  // GameSelector ctor: AssignRenderGroupToTrack("SelectorScreen_BG", 1) —
  // the BG composite draws before the clouds (exact track, not a prefix:
  // BG_Center/BG_Left/BG_Right stay in the normal group).
  assignRenderGroupToTrack(name, group) {
    const low = name.toLowerCase();
    this.def.tracks.forEach((tr, i) => {
      if (tr.name.toLowerCase() === low) this.tracks[i].renderGroup = group;
    });
  }
  // Re-sequence the track sweep so one track paints before another (same
  // positions, only render order changes). Used by the menu to tuck the
  // bottom woodsign plank behind the middle one.
  sendTrackBefore(moveName, beforeName) {
    const move = this.findTrackIndex(moveName), before = this.findTrackIndex(beforeName);
    if (move === before || !this.trackExists(moveName) || !this.trackExists(beforeName)) return;
    const seq = this.def.tracks.map((_, i) => i).filter((i) => i !== move);
    seq.splice(seq.indexOf(before), 0, move);
    this.sweepOrder = seq;
  }
  setImageOverride(trackName, rectOrNull) {
    if (!this.trackExists(trackName)) return;
    this.tracks[this.findTrackIndex(trackName)].imageOverride = rectOrNull;
  }
  // Reanimation::SetImageOverride(track, IMAGE_*) — armor damage stages
  // (Zombie::TakeHelmDamage/TakeShieldDamage). Looks the IMAGE_* cels up in
  // the atlas map grafted from the retail reanim PNGs; unknown keys (or
  // tracks) are a no-op, never a track-0 clobber.
  setImageOverrideByKey(trackName, imageKey) {
    if (!imageKey || !this.trackExists(trackName)) return false;
    const r = (this.def.images && this.def.images.get(imageKey)) || null;
    if (!r) return false;
    this.tracks[this.findTrackIndex(trackName)].imageOverride = r;
    return true;
  }
  clearImageOverride(trackName) { this.setImageOverride(trackName, null); }
  // ---- Reanimation::AttachToAnotherReanimation ----
  // The head's own overlay is *replaced* each frame (source overwrites
  // mOverlayMatrix via AttachmentUpdateAndSetMatrix), so per-head scale or
  // nudge (e.g. Zomboss driver: offset 28,-84, scale 1.2) is stored
  // separately and folded in during updateAttachment: overlay = M * offset.
  attachTo(parentReanim, trackName, ox = 0, oy = 0, osc = 1, hideWithParent = false, rot = 0) {
    if (this.frameBasePose === -1) this.frameBasePose = this.frameStart;
    // AttachEffect offset (Reanimator.cpp:473070): scale + translate, plus an
    // optional static rotation (seaweed's RandomLaunchSpin — retail rolls a
    // random spin angle at spawn with zero spin velocity, i.e. a fixed tilt).
    const c = Math.cos(rot) * osc, s = Math.sin(rot) * osc;
    this.attachOffset = { a: c, b: s, c: -s, d: c, e: ox, f: oy };
    this.hideWithParent = hideWithParent;
    const idx = parentReanim.findTrackIndex(trackName);
    // Source tracks host an attachment LIST per track (AttachReanim IDs), so
    // several children can hang off one track — the 3 menu flowers all share
    // SelectorScreen_BG_Right. A single-slot pointer orphaned all but the
    // last child, freezing their overlays at identity (the reported bug).
    const slot = parentReanim.tracks[idx];
    slot.attachments = slot.attachments || [];
    if (!slot.attachments.includes(this)) slot.attachments.push(this);
    this._attachParent = parentReanim; this._attachIdx = idx;
    this.x = parentReanim.x; this.y = parentReanim.y;
  }
  detach() {
    this.overlay = { ...IDENTITY };
    // Unlink from the parent's attachment list so a re-attached track never
    // keeps drawing (or refreshing) a stale child.
    try {
      const p = this._attachParent, i = this._attachIdx;
      if (p && p.tracks[i]) {
        const slot = p.tracks[i];
        slot.attachments = (slot.attachments || []).filter((c) => c !== this);
      }
    } catch (e) { /* ignore */ }
    this._attachParent = null; this._attachIdx = -1;
  }
  // ---- Reanimation::GetAttachmentOverlayMatrix (source shape, exactly) ----
  // overlay = (MatrixFromTransform(current) * mOverlayMatrix) * inv(basePose)
  // with PURE matrices: no cel/2 offset, no shake (those live only in
  // DrawTrack/GetTrackMatrix). The old code folded cel/2 + overlay into both
  // sides, which never cancels and threw attached children (plant heads,
  // flag poles) off their parent track whenever it moved.
  attachmentOverlayMatrix(idx) {
    const t = this.getCurrentTransform(idx);
    const cur = mulMat(Reanimation.matrixFrom(t), this.overlay);
    const fr = this.def.tracks[idx].frames;
    let pos = this.frameBasePose === -1 ? this.frameStart : this.frameBasePose;
    pos = Math.max(0, Math.min(fr.length - 1, pos));
    const b = fr[pos];
    const base = Reanimation.matrixFrom({ x: b.x, y: b.y, skx: b.skx, sky: b.sky, scx: b.scx, scy: b.scy });
    return mulMat(cur, invMat(base));
  }
  updateAttachment(idx) {
    const kids = this.tracks[idx].attachments || [];
    if (!kids.length) return;
    // source: AttachmentUpdateAndSetMatrix(track, GetAttachmentOverlayMatrix)
    //         then AttachEffect offset: overlay = M * mOffset
    const M = this.attachmentOverlayMatrix(idx);
    // Parent scale (Little Trouble half-size zombies, Zombie.cpp:792-799)
    // rides the child too: retail attachments inherit the carrier's
    // OverrideScale, so the flag pole shrinks with its zombie. S folds into
    // the overlay basis AND translation (S*M*o); scale-1 parents are
    // unaffected by construction (multiply by 1).
    const sx = this.scaleX, sy = this.scaleY;
    for (const child of kids) {
      const o = child.attachOffset || { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
      const b = mulMat(M, o);
      child.overlay = (sx === 1 && sy === 1) ? b : { a: sx * b.a, b: sx * b.b, c: sy * b.c, d: sy * b.d, e: sx * b.e, f: sy * b.f };
      child.x = this.x; child.y = this.y;
    }
  }
}
