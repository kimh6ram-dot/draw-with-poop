/* 똥으로 그리세요 — 카메라. 월드 좌표 → 화면: screen = (world - cam) * scale + view/2
 * 플레이: 데드존 추적(캐릭터가 화면 가운데 박스 안에 있으면 안 움직이고, 벗어날 때만 부드럽게 따라감).
 * 결과: fitBounds()로 작품 전체가 지정 영역 안에 들어오는 x/y/scale을 구해 보간.
 * fitRect()는 순수 함수라 저장 이미지(export.js)도 같은 계산을 쓴다. */
'use strict';
window.PD = window.PD || {};

PD.camera = (function () {
  const C = PD.CONFIG;
  const cam = { x: C.START_X, y: C.START_Y, scale: C.CAMERA_SCALE };
  let viewW = 0, viewH = 0;
  let tween = null;
  let playScale = C.CAMERA_SCALE; // 플레이 배율(모바일/PC 가 다름) — main 이 리사이즈 때 정한다

  /* 플레이 배율 설정. applyNow 면 즉시 적용(플레이 중 창 크기 변경) */
  function setPlayScale(v, applyNow) {
    playScale = v;
    if (applyNow && !tween) { cam.scale = v; clampToWorld(); }
  }

  function clampToWorld() {
    const halfW = viewW / 2 / cam.scale, halfH = viewH / 2 / cam.scale;
    cam.x = halfW * 2 >= C.WORLD_W ? C.WORLD_W / 2 : Math.max(halfW, Math.min(C.WORLD_W - halfW, cam.x));
    cam.y = halfH * 2 >= C.WORLD_H ? C.WORLD_H / 2 : Math.max(halfH, Math.min(C.WORLD_H - halfH, cam.y));
  }

  function setView(w, h) {
    viewW = w; viewH = h;
    if (!tween) clampToWorld();
  }

  function reset(x, y) {
    cam.x = x; cam.y = y; cam.scale = playScale;
    tween = null;
    clampToWorld();
  }

  /* 데드존 추적 — 캐릭터(tx, ty)가 박스 밖이면 박스 가장자리까지만 카메라 목표를 옮긴다 */
  function follow(tx, ty, dt) {
    const s = cam.scale;
    const sx = (tx - cam.x) * s + viewW / 2, sy = (ty - cam.y) * s + viewH / 2;
    const hw = viewW * C.CAMERA_DEADZONE_W / 2, hh = viewH * C.CAMERA_DEADZONE_H / 2;
    const cx = viewW / 2, cy = viewH * C.CAMERA_DEADZONE_CY;
    let gx = cam.x, gy = cam.y;
    if (sx < cx - hw) gx = cam.x + (sx - (cx - hw)) / s;
    else if (sx > cx + hw) gx = cam.x + (sx - (cx + hw)) / s;
    if (sy < cy - hh) gy = cam.y + (sy - (cy - hh)) / s;
    else if (sy > cy + hh) gy = cam.y + (sy - (cy + hh)) / s;
    const k = 1 - Math.exp(-C.CAMERA_SMOOTH * dt);
    cam.x += (gx - cam.x) * k;
    cam.y += (gy - cam.y) * k;
    clampToWorld();
  }

  /* bounds{minX,maxX,minY,maxY}(월드) 를 rect{x,y,w,h}(대상 px) 안에 여백을 두고 맞추는 변환 {scale, ox, oy}
   * (world * scale + o = 대상 px). maxScale = 똥 몇 개뿐일 때 과확대 상한 */
  function fitRect(b, rect, maxScale) {
    const bw = Math.max(1, b.maxX - b.minX), bh = Math.max(1, b.maxY - b.minY);
    const padW = Math.max(bw, bh) * C.RESULT_FIT_PAD_RATIO;
    let scale = Math.min(rect.w / (bw + 2 * padW), rect.h / (bh + 2 * padW), maxScale);
    const pm = C.RESULT_FIT_PAD_MIN;
    scale = Math.min(scale, Math.max(0.01, rect.w - 2 * pm) / bw, Math.max(0.01, rect.h - 2 * pm) / bh);
    const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
    return { scale, ox: rect.x + rect.w / 2 - cx * scale, oy: rect.y + rect.h / 2 - cy * scale };
  }

  /* 화면(CSS px) 안의 rect 에 작품을 맞추는 카메라 값 */
  function fitBounds(b, rect, maxScale) {
    const f = fitRect(b, rect, maxScale);
    return { x: (viewW / 2 - f.ox) / f.scale, y: (viewH / 2 - f.oy) / f.scale, scale: f.scale };
  }

  function tweenTo(target, ms) {
    if (!(ms > 0)) { cam.x = target.x; cam.y = target.y; cam.scale = target.scale; tween = null; return; }
    tween = { from: { x: cam.x, y: cam.y, scale: cam.scale }, to: target, t: 0, ms };
  }

  function updateTween(dt) {
    if (!tween) return;
    tween.t += dt * 1000;
    const a = Math.min(1, tween.t / tween.ms);
    const e = 1 - Math.pow(1 - a, 3);
    cam.x = tween.from.x + (tween.to.x - tween.from.x) * e;
    cam.y = tween.from.y + (tween.to.y - tween.from.y) * e;
    cam.scale = tween.from.scale + (tween.to.scale - tween.from.scale) * e;
    if (a >= 1) tween = null;
  }

  function get() { return cam; }

  return { setView, reset, follow, fitRect, fitBounds, tweenTo, updateTween, get, setPlayScale,
    get playScale() { return playScale; }, get viewW() { return viewW; }, get viewH() { return viewH; } };
})();
