/* 똥으로 그리세요 — 캔버스 렌더러.
 * 똥은 벡터 💩 모양을 배율별로 한 번만 오프스크린에 래스터해 두고(스프라이트 캐시) drawImage로 찍는다.
 * 매 프레임 벡터 패스를 다시 그리지 않으므로 수백~수천 개도 비용이 거의 일정하다. 뷰포트 밖은 컬링.
 * 똥 PNG가 오면 poopSprite()가 그 이미지를 돌려주게 바꾸면 된다(drawPoop 호출부는 그대로).
 *
 * 똥 등장 연출(3차): 각 똥의 t(생성 시각)로부터 emerge(엉덩이 아래에서 작게→제 크기) → fall(spawn→ground, 중력 ease-in)
 * → land(착지 squash→복원) → rest(최종 위치 고정)를 계산한다. 연출 중인 똥은 캐릭터 앞에 그린다. */
'use strict';
window.PD = window.PD || {};

PD.renderer = (function () {
  const C = PD.CONFIG;
  let canvas, ctx;
  let dpr = 1, cssW = 0, cssH = 0;
  const spriteCache = new Map();

  function init(el) {
    canvas = el;
    ctx = canvas.getContext('2d');
  }

  function resize(w, h) {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cssW = w; cssH = h;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
  }

  /* 💩 벡터 — 원점이 중심, D = 지름(px). 아래가 넓고 위로 갈수록 좁아지는 3단 + 꼭지 */
  function drawPoopPath(c2, D) {
    const col = C.POOP_COLORS;
    c2.lineWidth = Math.max(1, D * 0.08);
    c2.strokeStyle = col.line;
    c2.fillStyle = col.fill;
    c2.lineJoin = 'round';
    const blob = (cx, cy, rx, ry) => {
      c2.beginPath();
      c2.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      c2.fill();
      c2.stroke();
    };
    blob(0, D * 0.22, D * 0.48, D * 0.25);
    blob(0, D * -0.02, D * 0.37, D * 0.21);
    blob(D * 0.02, D * -0.24, D * 0.25, D * 0.16);
    // 꼭지
    c2.beginPath();
    c2.moveTo(D * -0.08, D * -0.34);
    c2.quadraticCurveTo(D * 0.06, D * -0.50, D * 0.14, D * -0.46);
    c2.quadraticCurveTo(D * 0.10, D * -0.36, D * 0.12, D * -0.30);
    c2.closePath();
    c2.fill();
    c2.stroke();
    // 하이라이트
    c2.fillStyle = col.light;
    c2.beginPath();
    c2.ellipse(D * -0.16, D * 0.14, D * 0.10, D * 0.05, -0.4, 0, Math.PI * 2);
    c2.fill();
  }

  /* 큰 PNG를 목표 크기까지 절반씩 줄여 가며 그린다(한 번에 10배 이상 줄이면 계단·번짐이 생긴다) */
  function drawScaled(img, bx, by, bw, bh, w, h) {
    let src = img, sx = bx, sy = by, sw = bw, sh = bh;
    while (sw / w > 2 && sh / h > 2) {
      const tw = Math.max(w, Math.round(sw / 2)), th = Math.max(h, Math.round(sh / 2));
      const tmp = document.createElement('canvas');
      tmp.width = tw; tmp.height = th;
      const tctx = tmp.getContext('2d');
      tctx.imageSmoothingEnabled = true; tctx.imageSmoothingQuality = 'high';
      tctx.drawImage(src, sx, sy, sw, sh, 0, 0, tw, th);
      src = tmp; sx = 0; sy = 0; sw = tw; sh = th;
    }
    const oc = document.createElement('canvas');
    oc.width = w + 2; oc.height = h + 2;
    const octx = oc.getContext('2d');
    octx.imageSmoothingEnabled = true; octx.imageSmoothingQuality = 'high';
    octx.drawImage(src, sx, sy, sw, sh, 1, 1, w, h);
    return oc;
  }

  /* pxPerUnit = 카메라 배율 × dpr, variant = config.POOP_VARIANTS 인덱스(똥마다 p.v). 0.05 단위로 양자화해 캐시.
   * 사용자 에셋(PD.sprites)이 있으면 그 PNG를 가로 폭 POOP_SIZE×scale 로 래스터, 없으면(로드 전) 벡터 폴백. */
  function poopSprite(pxPerUnit, variant) {
    const vi = variant | 0;
    const V = (C.POOP_VARIANTS && C.POOP_VARIANTS[vi]) || (C.POOP_VARIANTS && C.POOP_VARIANTS[0]) || { id: null, scale: 1 };
    const q = Math.max(0.05, Math.round(pxPerUnit * 20) / 20);
    const entry = V.id && PD.sprites ? PD.sprites.get(V.id) : null;
    const key = (entry ? vi : 'vec') + ':' + q;
    let sp = spriteCache.get(key);
    if (sp) return sp;
    if (spriteCache.size > 48) spriteCache.clear();
    if (entry) {
      const w = Math.max(2, Math.round(C.POOP_SIZE * (V.scale || 1) * q));
      const h = Math.max(2, Math.round(w * entry.bbox.h / entry.bbox.w));
      const oc = drawScaled(entry.img, entry.bbox.x, entry.bbox.y, entry.bbox.w, entry.bbox.h, w, h);
      sp = { canvas: oc, w: oc.width, h: oc.height, pxPerUnit: q };
    } else {
      const D = C.POOP_SIZE * q;
      const pad = Math.ceil(D * 0.15) + 1;
      const S = Math.ceil(D + pad * 2);
      const oc = document.createElement('canvas');
      oc.width = S; oc.height = S;
      const octx = oc.getContext('2d');
      octx.translate(S / 2, S / 2);
      drawPoopPath(octx, D);
      sp = { canvas: oc, w: S, h: S, pxPerUnit: q };
    }
    spriteCache.set(key, sp);
    return sp;
  }

  /* (sx, sy) = 화면 CSS px 중심(바닥 접점 기준으로 squash). scale = 월드→CSS 배율, dprLocal = 대상 캔버스의 dpr(저장 이미지는 1)
   * scaleX/scaleY = 연출용 변형(기본 1). 세로 변형은 아래쪽(바닥)을 고정한 채 눌린다. variant = 똥 그림 종류(p.v) */
  function drawPoop(c2, sx, sy, scale, dprLocal, scaleX, scaleY, variant) {
    const sp = poopSprite(scale * dprLocal, variant);
    const w0 = sp.w / dprLocal, h0 = sp.h / dprLocal;
    const w = w0 * (scaleX || 1), h = h0 * (scaleY || 1);
    c2.drawImage(sp.canvas, sx - w / 2, sy + h0 / 2 - h, w, h);
  }

  function easeOutQuad(t) { return 1 - (1 - t) * (1 - t); }

  /* 똥 하나의 현재 연출 상태: { x, y, sx, sy, front } (월드 좌표 + 스케일) */
  function poopAnim(p, now) {
    const E = C.POOP_EMERGE_MS, F = C.POOP_FALL_MS, L = C.POOP_LAND_MS;
    const age = (now - p.t) * 1000;
    if (p.sx == null || !(age < E + F + L)) return { x: p.x, y: p.y, sx: 1, sy: 1, front: false, phase: 'rest', prog: 1 };
    if (age < E) { // 엉덩이 아래에서 작게 나오기 시작
      const a = easeOutQuad(Math.max(0, age / E));
      const s = 0.25 + 0.65 * a;
      return { x: p.sx, y: p.sy, sx: s, sy: s, front: true, phase: 'emerge', prog: Math.max(0, age / E) };
    }
    if (age < E + F) { // 짧은 낙하(중력: 아래로 갈수록 빨라짐), 살짝 늘어남
      const a = (age - E) / F;
      const g = a * a;
      return { x: p.sx + (p.x - p.sx) * a, y: p.sy + (p.y - p.sy) * g, sx: 0.9 + 0.06 * a, sy: 0.9 + 0.16 * a, front: true, phase: 'fall', prog: a };
    }
    // 착지: 아주 작게 눌렸다가 바로 복원(튀지 않음)
    const a = (age - E - F) / L;
    const k = Math.sin(a * Math.PI) * C.POOP_LAND_SQUASH;
    return { x: p.x, y: p.y, sx: 1 + k, sy: 1 - k, front: true, phase: 'land', prog: a };
  }

  /* 놓인 똥(poop_1)의 세로/가로 비 — 애니메이션 프레임의 바닥선을 맞추는 데 쓴다 */
  function restAspect() {
    const e = PD.sprites && PD.sprites.get((C.POOP_VARIANTS[0] || {}).id);
    return e ? e.bbox.h / e.bbox.w : 0.86;
  }

  /* snap = world.snapshot(), cam = { x, y, scale }, opts = { showCharacter, showMarker } */
  function render(snap, cam, opts) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, cssW, cssH);

    const s = cam.scale;
    const ox = cssW / 2 - cam.x * s, oy = cssH / 2 - cam.y * s; // screen = world * s + o
    const r = C.POOP_SIZE * 0.7 + 14; // 컬링 여유(연출 중 spawn 위치까지 포함)
    const minX = (-ox) / s - r, maxX = (cssW - ox) / s + r;
    const minY = (-oy) / s - r, maxY = (cssH - oy) / s + r;
    const poops = snap.poops;
    const showChar = !!opts.showCharacter;
    const charY = snap.y;
    const front = [];
    const now = snap.time;

    const CS = PD.characterSprite;
    const useFrames = !!(CS && CS.ready);
    const drawOne = (p, a) => {
      if (a && a.phase !== 'rest' && useFrames) { // 시트의 똥 애니메이션 프레임(나옴·낙하·착지), 위치는 spawn→ground 보간
        if (CS.drawPoopFrame(ctx, a.x * s + ox, a.y * s + oy, s, dpr, a.phase, a.prog, restAspect())) return;
      }
      if (a) drawPoop(ctx, a.x * s + ox, a.y * s + oy, s, dpr, a.sx, a.sy, p.v);
      else drawPoop(ctx, p.x * s + ox, p.y * s + oy, s, dpr, 1, 1, p.v);
    };

    for (let i = 0; i < poops.length; i++) {
      const p = poops[i];
      if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) continue;
      const a = showChar ? poopAnim(p, now) : null;
      // 가림 순서: 연출 중에는 방향별 플래그(p.f — 정면은 몸 뒤, 그 외는 몸 앞), 놓인 뒤에는 발 기준선보다 아래(앞)면 캐릭터 앞
      const inFront = showChar && (a.phase !== 'rest' ? p.f !== false : p.y > charY);
      if (inFront) { front.push([p, a]); continue; }
      drawOne(p, a);
    }

    if (showChar) {
      if (opts.showMarker && C.SHOW_SPAWN_MARKER && snap.action === 'idle') {
        ctx.fillStyle = 'rgba(0,0,0,0.16)';
        ctx.beginPath();
        ctx.arc(snap.spawn.x * s + ox, snap.spawn.y * s + oy, 2.2 * s, 0, Math.PI * 2);
        ctx.fill();
      }
      // 캐릭터: 스프라이트(사용자 시트) → 3D(WebGL) → 2D 선화 순으로 폴백
      const C3 = PD.character3d, CSp = PD.characterSprite;
      const cx = snap.x * s + ox, cy = snap.y * s + oy;
      if (!((CSp && CSp.ready && CSp.draw(ctx, cx, cy, s, dpr, snap.pose)) || (C3 && C3.ready && C3.draw(ctx, cx, cy, s, dpr, snap.pose)))) {
        ctx.save();
        ctx.translate(snap.x * s + ox, snap.y * s + oy);
        ctx.scale(s, s);
        PD.character.draw(ctx, snap.pose);
        ctx.restore();
      }
      for (let j = 0; j < front.length; j++) drawOne(front[j][0], front[j][1]);
    }
  }

  return { init, resize, render, drawPoop, poopSprite, poopAnim, get dpr() { return dpr; } };
})();
