/* 똥으로 그리세요 — 스프라이트 캐릭터(사용자 제공 시트 PNG, 최종 기준). 게임 로직은 world.js에 있고 여기엔 "그림"만 있다.
 * character-data.js(tools/build-character.js 가 시트에서 잘라 base64 내장)의 프레임을 상태·방향·진행도로 고른다.
 *
 * 프레임 매핑(시트 기준):
 *   idle  : face 8방향 → idle_front / idle_back / idle_left / idle_right / idle_diag_left·right(아래 대각선). 위 대각선은 후면.
 *   walk  : 가로 성분이 더 크면 옆모습 걷기 12프레임 루프(walkPhase 2π = 12프레임, 이동 거리 기반 → 미끄러짐 없음), 왼쪽은 좌우 반전.
 *           위/아래(및 세로 성분이 큰 대각선)는 걷기 프레임이 시트에 없어 해당 방향의 서 있는 프레임 + 작은 상하 bob.
 *   stop → poop_wait, squat → poop_ready1·2, strain → poop_do1, poop → poop_do2·3(구운 똥 제거본), rise → poop_rise1·2(2 는 정면).
 *           배변 프레임은 옆모습만 있어 항상 좌/우(마지막 가로 방향)로 돌아서 앉고, 왼쪽은 반전.
 *   똥 애니메이션: poopanim_1~5 (나옴 2장 · 낙하 1장 · 착지 2장), 놓인 뒤에는 assets/poop_1.png(sprites-data).
 * 기준점: 각 프레임의 ax,ay = 발이 닿는 점(시트의 받침 접시 중심), ppu = 접시 폭(px) = 1단위 → 프레임마다 크기·위치가 튀지 않는다.
 * 그림자·필터 없음. 원본 픽셀은 손대지 않는다(접시·구운 똥 제거만). */
'use strict';
window.PD = window.PD || {};

PD.characterSprite = (function () {
  const C = PD.CONFIG;
  const K = C.CHARACTER_SPRITE || {};
  const F = {};
  let meta = null, ready = false;

  function load(onDone) {
    const data = window.PD_CHARACTER || {};
    meta = data._meta || { standUnits: 1.9 };
    const ids = Object.keys(data).filter(k => k[0] !== '_');
    const jobs = [];
    ids.forEach(id => {
      const e = data[id];
      F[id] = { w: e.w, h: e.h, ax: e.ax, ay: e.ay, ppu: e.ppu, img: null, parts: null };
      jobs.push({ src: e.src, set: img => { F[id].img = img; } });
      if (e.parts) {
        F[id].parts = {};
        for (const k in e.parts) { const p = e.parts[k]; F[id].parts[k] = { w: p.w, h: p.h, ox: p.ox, oy: p.oy, px: p.px, py: p.py, img: null }; jobs.push({ src: p.src, set: img => { F[id].parts[k].img = img; } }); }
      }
    });
    let remaining = jobs.length;
    const finish = () => { ready = ids.length > 0 && !!(F.idle_front && F.idle_front.img); if (onDone) onDone(ready); };
    if (!remaining) { finish(); return; }
    jobs.forEach(j => {
      const img = new Image();
      img.onload = () => { j.set(img); if (--remaining === 0) finish(); };
      img.onerror = () => { console.error('캐릭터 프레임 로드 실패'); if (--remaining === 0) finish(); };
      img.src = j.src;
    });
  }

  /* 정면·후면 걷기(부위 분리): 다리는 번갈아 들어 올리고(위로만 → 바지 뒤로 숨음), 팔은 다리와 반대 위상으로 소매 끝을 축으로 작게 흔들고,
   * 몸통은 걸음마다 살짝 들썩인다. 그림을 늘리거나 좌우로 흔들지 않는다. 값은 서 있는 키(unitPx) 비율. */
  function walkParts(pose, unitPx) {
    const ph = pose.walkPhase || 0;
    const bl = pose.walkBlend != null ? clamp01(pose.walkBlend) : (pose.moving ? 1 : 0);
    const lift = K.frontLift != null ? K.frontLift : 0.05, bobA = K.frontBob != null ? K.frontBob : 0.015, swing = K.frontArmSwing != null ? K.frontArmSwing : 0.14;
    return {
      liftL: Math.max(0, Math.sin(ph)) * lift * unitPx * bl,
      liftR: Math.max(0, Math.sin(ph + Math.PI)) * lift * unitPx * bl,
      bob: -Math.abs(Math.sin(ph)) * bobA * unitPx * bl,
      armL: -Math.sin(ph) * swing * bl,      // 왼다리가 들릴 때 왼팔은 뒤로
      armR: Math.sin(ph) * swing * bl,
      blend: bl,
    };
  }
  const clamp01 = v => Math.max(0, Math.min(1, v || 0));

  function drawWithParts(ctx, f, s, pose, unitPx) {
    const P = f.parts, wp = walkParts(pose, unitPx);
    const piece = (p, dx, dy) => { if (p.img) ctx.drawImage(p.img, (p.ox - f.ax) * s + dx, (p.oy - f.ay) * s + dy, p.w * s, p.h * s); };
    const arm = (p, rot, dy) => {
      if (!p.img) return;
      ctx.save();
      ctx.translate((p.px - f.ax) * s, (p.py - f.ay) * s + dy);
      ctx.rotate(rot);
      ctx.drawImage(p.img, (p.ox - p.px) * s, (p.oy - p.py) * s, p.w * s, p.h * s);
      ctx.restore();
    };
    piece(P.legL, 0, -wp.liftL);
    piece(P.legR, 0, -wp.liftR);
    piece(P.body, 0, wp.bob);
    arm(P.armL, wp.armL, wp.bob);
    arm(P.armR, wp.armR, wp.bob);
  }

  const WALK_LOOP = K.walkLoopFrames || 12;

  function idleFrame(face) {
    const fx = face.x, fy = face.y, ax = Math.abs(fx), ay = Math.abs(fy);
    if (ay > 0.92) return fy > 0 ? 'idle_front' : 'idle_back';
    if (ax > 0.92) return fx > 0 ? 'idle_right' : 'idle_left';
    if (fy > 0) return fx > 0 ? 'idle_diag_right' : 'idle_diag_left'; // 아래 대각선: 시트 프레임
    return 'idle_back';                                                 // 위 대각선: 시트에 없음 → 후면
  }

  /* pose → { id, flip, bob } */
  function pick(pose) {
    const st = pose.state || 'idle', face = pose.face || { x: 1, y: 0 }, side = pose.facing || 1, t = pose.t || 0;
    const flipSide = side < 0;
    switch (st) {
      case 'stop': return { id: 'poop_wait', flip: flipSide };
      case 'squat': return { id: t < 0.5 ? 'poop_ready1' : 'poop_ready2', flip: flipSide };
      case 'strain': return { id: 'poop_do1', flip: flipSide };
      case 'poop': return { id: t < 0.5 ? 'poop_do2' : 'poop_do3', flip: flipSide };
      case 'rise': return t < 0.6 ? { id: 'poop_rise1', flip: flipSide } : { id: 'poop_rise2', flip: false }; // rise2 = 정면(대칭)
      case 'walk': {
        if (Math.abs(face.x) >= Math.abs(face.y)) {
          const n = ((Math.floor((pose.walkPhase || 0) / (2 * Math.PI) * WALK_LOOP) % WALK_LOOP) + WALK_LOOP) % WALK_LOOP;
          return { id: 'walk_' + String(n + 1).padStart(2, '0'), flip: face.x < 0 };
        }
        const id = idleFrame(face);
        return F[id] && F[id].parts ? { id, flip: false, parts: true } : { id, flip: false, bob: true };
      }
      default: {
        const id = idleFrame(face);
        // 멈춘 직후(블렌드가 빠지는 동안)는 부위 조각으로 그려 다리가 기본 자세로 돌아오게
        if ((pose.walkBlend || 0) > 0 && F[id] && F[id].parts) return { id, flip: false, parts: true };
        return { id, flip: false };
      }
    }
  }

  /* (sx, sy) = 발 중심 화면 CSS px. scale = 월드→CSS 배율. 성공 시 true */
  function draw(ctx, sx, sy, scale, dpr, pose) {
    if (!ready) return false;
    const sel = pick(pose);
    const f = F[sel.id] || F.idle_front;
    if (!f) return false;
    const unitPx = C.CHARACTER_HEIGHT * scale / meta.standUnits; // 접시 1단위 = 이만큼 CSS px
    const s = unitPx / f.ppu;                                     // 이미지 px → CSS px
    let bob = 0;
    if (sel.bob) bob = -Math.abs(Math.sin(pose.walkPhase || 0)) * (K.bobUnits != null ? K.bobUnits : 0.04) * unitPx * (pose.walkBlend != null ? pose.walkBlend : 1);
    ctx.save();
    ctx.translate(sx, sy + bob);
    if (sel.flip) ctx.scale(-1, 1);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (sel.parts && f.parts) drawWithParts(ctx, f, s, pose, unitPx);
    else if (f.img) ctx.drawImage(f.img, -f.ax * s, -f.ay * s, f.w * s, f.h * s);
    ctx.restore();
    return true;
  }

  /* 똥 애니메이션 프레임: phase = emerge | fall | land, a = 그 단계 진행도 0..1 */
  function poopFrame(phase, a) {
    const n = phase === 'emerge' ? (a < 0.5 ? 1 : 2) : phase === 'fall' ? 3 : (a < 0.5 ? 4 : 5);
    return F['poopanim_' + n] || null;
  }
  /* (cx, cy) = 똥 중심(놓였을 때의 중심) 화면 px. restAspect = 놓인 똥(poop_1)의 h/w — 바닥선을 맞추기 위해 */
  function drawPoopFrame(ctx, cx, cy, scale, dpr, phase, a, restAspect) {
    const f = poopFrame(phase, a);
    if (!f) return false;
    const w1 = C.POOP_SIZE * scale;                // 착지 프레임 폭 = 놓인 똥 폭
    const s = w1 / f.ppu;
    const bottom = cy + w1 * (restAspect || 0.86) / 2;
    ctx.drawImage(f.img, cx - f.ax * s, bottom - f.h * s, f.w * s, f.h * s);
    return true;
  }

  return { load, draw, pick, walkParts, drawPoopFrame, get ready() { return ready; }, frames: F, get meta() { return meta; } };
})();
