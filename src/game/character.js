/* 똥으로 그리세요 — 캐릭터 "그림"만 담당(임시 벡터 선화, 4방향). 게임 로직은 world.js에 있고 여기엔 없다.
 *
 * 교체 지점: 나중에 PNG/스프라이트 시트가 오면 이 파일의 draw()만 "pose.state + pose.dir (+pose.t) → 프레임 선택 → drawImage"로
 * 바꾸면 된다. 호출 규약은 그대로:
 *   ctx 원점 = 캐릭터 발 중심(바닥), y는 위가 음수, 단위 = 월드 유닛(카메라 배율은 호출 쪽이 적용)
 *   pose = { state, t, dir, facing, crouch: 0..1, strain: 0..1, push: 0..1, walkPhase: rad, walkBlend: 0..1, moving, turn: {from, t}|null, time }
 *   state: walk · idle · stop · squat · strain · poop · rise      dir: right · left · down(정면) · up(후면)
 *
 * 임시 선화는 state 대신 연속값(crouch/strain/push/walkPhase/walkBlend)으로 관절을 보간해 그린다 — 단계 사이에 자세가 튀지 않는다.
 * 세 가지 뷰를 각각 관절 배치로 그린다(회전·반전으로 정면/후면을 만들지 않는다). 좌우는 옆모습 한 벌을 facing 으로 반전.
 * 공통 규격: 머리 반지름 0.16H · 몸통 캡슐 폭 0.20H · 선 두께 0.05H · 흰 채움/검정 선.
 * 걷기: 다리 교차 + 발 들림 + 팔 반대 위상 + 몸통 2배 주기 들썩임(머리는 60%만). walkBlend 로 시작/정지가 보간된다.
 * 방향 전환: pose.turn 동안 가로로 좁아졌다(이전 방향) 새 방향으로 펴진다(몸을 돌리는 느낌).
 * 얼굴은 눈 점(정면 2개·옆 1개)과 힘줄 때 질끈뿐 — 표정 에셋이 오면 state 로 연결. 후면은 눈이 없다. */
(function () {
  'use strict';

  const PD = window.PD;
  const C = PD.CONFIG;
  const LINE = '#000000', FILL = '#FFFFFF';

  const clamp01 = v => Math.max(0, Math.min(1, v || 0));
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerp2 = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });

  function strokePath(ctx, pts, width) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.lineWidth = width;
    ctx.stroke();
  }
  /* 몸통: 검정 굵은 선 위에 흰 선 → 외곽선 있는 캡슐 */
  function capsule(ctx, a, b, width, lw) {
    ctx.strokeStyle = LINE; strokePath(ctx, [a, b], width + lw * 2);
    ctx.strokeStyle = FILL; strokePath(ctx, [a, b], width);
    ctx.strokeStyle = LINE;
  }
  function drawHead(ctx, x, y, r, lw) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = FILL; ctx.fill();
    ctx.lineWidth = lw; ctx.stroke();
  }
  function eye(ctx, x, y, headR, lw, squint) {
    ctx.fillStyle = LINE;
    if (squint) { ctx.beginPath(); ctx.moveTo(x - headR * 0.26, y); ctx.lineTo(x + headR * 0.26, y); ctx.lineWidth = lw * 0.9; ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(x, y, headR * 0.17, 0, Math.PI * 2); ctx.fill(); }
  }

  /* ---------- 옆모습 (f = +1 오른쪽 / -1 왼쪽) ---------- */
  function drawSide(ctx, H, f, c, strain, push, walk) {
    const lw = Math.max(1.6, H * 0.05), headR = H * 0.16;
    const ph = walk.phase, bl = walk.blend;
    const bob = -Math.abs(Math.sin(ph)) * H * 0.015 * bl;          // 한 걸음마다 살짝 내려앉았다 올라옴

    const hipX = lerp(0, -f * H * 0.16, c) - f * push * H * 0.01;      // 앉으면 엉덩이가 뒤로, 힘줄 때 조금 더
    const hipY = lerp(-H * 0.46, -H * 0.16, c) + push * H * 0.03 + bob;
    const shX = lerp(0, hipX + f * H * 0.13, c) + f * push * H * 0.03;  // 상체는 살짝 앞으로
    const shY = lerp(-H * 0.76, -H * 0.42, c) + push * H * 0.03 + bob;
    const headX = shX + f * lerp(H * 0.01, H * 0.06, c);
    const headY = shY - headR - H * 0.02 - bob * 0.4;                 // 머리는 몸통 들썩임의 60%만

    const legs = [-1, 1].map(side => {
      const p = ph + (side > 0 ? 0 : Math.PI);
      const sw = Math.sin(p) * bl, lift = Math.max(0, Math.cos(p)) * H * 0.06 * bl;
      const footStand = { x: f * sw * H * 0.17 + side * H * 0.03, y: -lift };
      const kneeStand = { x: (hipX + footStand.x) / 2 + f * H * 0.02 + f * lift * 0.5, y: (hipY + footStand.y) / 2 };
      const footCrouch = { x: side * H * 0.05 + f * H * 0.06, y: 0 };     // 발은 엉덩이보다 앞, 바닥에
      const kneeCrouch = { x: footCrouch.x + f * H * 0.14, y: -H * 0.32 }; // 무릎은 앞으로, 엉덩이보다 높게
      return { foot: lerp2(footStand, footCrouch, c), knee: lerp2(kneeStand, kneeCrouch, c) };
    });
    const frontKnee = legs[1].knee;
    const swing = Math.sin(ph) * bl;
    const arms = [-1, 1].map(side => {
      const sa = -swing * side; // 팔은 다리와 반대 위상
      const handStand = { x: shX + f * sa * H * 0.12 + side * H * 0.02, y: shY + H * 0.26 };
      const handCrouch = { x: frontKnee.x + f * H * 0.03 + side * H * 0.015, y: frontKnee.y - H * 0.02 }; // 손은 무릎 위
      const hand = lerp2(handStand, handCrouch, c);
      const elbow = { x: (shX + hand.x) / 2 - f * c * H * 0.02, y: (shY + hand.y) / 2 + H * 0.02 };
      return { elbow, hand };
    });

    const hip = { x: hipX, y: hipY }, sh = { x: shX, y: shY };
    ctx.lineWidth = lw;
    strokePath(ctx, [hip, legs[0].knee, legs[0].foot], lw);   // 뒤쪽 다리
    strokePath(ctx, [sh, arms[0].elbow, arms[0].hand], lw);   // 뒤쪽 팔
    capsule(ctx, hip, sh, H * 0.20, lw);
    strokePath(ctx, [hip, legs[1].knee, legs[1].foot], lw);   // 앞쪽 다리
    strokePath(ctx, [sh, arms[1].elbow, arms[1].hand], lw);   // 앞쪽 팔
    drawHead(ctx, headX, headY, headR, lw);
    eye(ctx, headX + f * headR * 0.45, headY - headR * 0.08, headR, lw, strain > 0.3);
  }

  /* ---------- 정면(back=false, 얼굴이 보임) / 후면(back=true, 뒷모습) ----------
   * 화면 위 = 멀어지는 쪽. 정면은 "앞으로 내딛는 발"이 화면 아래(가까이)로, 후면은 화면 위로 간다(dz). */
  function drawFrontBack(ctx, H, back, c, strain, push, walk) {
    const lw = Math.max(1.6, H * 0.05), headR = H * 0.16;
    const ph = walk.phase, bl = walk.blend;
    const dz = back ? -1 : 1;
    const bob = -Math.abs(Math.sin(ph)) * H * 0.012 * bl;

    const pelvisY = lerp(-H * 0.46, -H * 0.16, c) + push * H * 0.03 + bob;      // 엉덩이: 앉으면 바닥 근처까지
    const neckY = lerp(-H * 0.76, -H * 0.42, c) + push * H * 0.03 + bob + dz * c * H * 0.02; // 숙이면 정면은 머리가 조금 내려오고(가까워짐) 후면은 올라감
    const headY = neckY - headR - H * 0.02 - bob * 0.4;

    /* 앞/뒤에서 본 걸음: 스윙하는 다리는 무릎을 들어 올리며(위·바깥으로) 발이 땅에서 떨어지고, 디딘 다리는 곧게 선다.
     * 깊이 방향(앞으로 내딛음)은 화면에선 거의 안 보이므로 작은 dz 항만 둔다. */
    const legs = [-1, 1].map(side => {
      const p = ph + (side > 0 ? 0 : Math.PI);
      const sw = Math.sin(p) * bl;                  // +: 앞으로 내딛음(깊이)
      const lift = Math.max(0, Math.cos(p)) * bl;   // 발이 땅에서 떨어진 정도(스윙 중간에 최대)
      const hip = { x: side * H * 0.05, y: pelvisY };
      // 무릎을 들면 무릎은 바깥·위로, 발은 땅에서 떨어져 안쪽으로 → 앞에서 봐도 "<" 로 꺾인 다리가 보인다(행진하듯)
      const footStand = { x: side * (H * 0.08 - lift * H * 0.02), y: -lift * H * 0.12 + dz * sw * H * 0.015 };
      const kneeStand = { x: side * (H * 0.075 + lift * H * 0.10), y: -H * 0.24 - lift * H * 0.10 + dz * sw * H * 0.01 };
      const footCrouch = { x: side * H * 0.10, y: 0 };               // 발은 조금 벌어진 채 바닥에
      const kneeCrouch = { x: side * H * 0.17, y: -H * 0.30 };        // 무릎은 바깥·위로 벌어짐(쪼그려 앉기)
      return { hip, knee: lerp2(kneeStand, kneeCrouch, c), foot: lerp2(footStand, footCrouch, c) };
    });
    const arms = [-1, 1].map(side => {
      const sa = -Math.sin(ph + (side > 0 ? 0 : Math.PI)) * bl; // 같은 쪽 다리와 반대 위상
      const sh = { x: side * H * 0.11, y: neckY + H * 0.04 };
      // 팔은 몸통 옆에 살짝 떨어져 보이게(±0.16H), 걸을 때 앞뒤 흔들림은 손 높이로(±0.05H)
      const handStand = { x: side * (H * 0.16 - Math.abs(sa) * H * 0.02), y: pelvisY + H * 0.02 + dz * sa * H * 0.05 };
      const elbowStand = { x: side * H * 0.165, y: (sh.y + handStand.y) / 2 };
      const kneeF = legs[side > 0 ? 1 : 0].knee;
      const handCrouch = { x: kneeF.x + side * H * 0.01, y: kneeF.y - H * 0.02 }; // 손은 무릎 위
      const elbowCrouch = { x: side * H * 0.16, y: (sh.y + handCrouch.y) / 2 + H * 0.01 };
      return { sh, elbow: lerp2(elbowStand, elbowCrouch, c), hand: lerp2(handStand, handCrouch, c) };
    });

    ctx.lineWidth = lw;
    legs.forEach(l => strokePath(ctx, [l.hip, l.knee, l.foot], lw));
    capsule(ctx, { x: 0, y: pelvisY }, { x: 0, y: neckY }, H * 0.20, lw);
    arms.forEach(a => strokePath(ctx, [a.sh, a.elbow, a.hand], lw));
    drawHead(ctx, 0, headY, headR, lw);
    if (!back) { // 정면: 눈 2개. 후면: 없음(뒷머리)
      const ey = headY - headR * 0.05, squint = strain > 0.3;
      eye(ctx, -headR * 0.36, ey, headR, lw, squint);
      eye(ctx, headR * 0.36, ey, headR, lw, squint);
    }
  }

  function draw(ctx, pose) {
    const H = C.CHARACTER_HEIGHT;
    const c = clamp01(pose.crouch), strain = clamp01(pose.strain), push = clamp01(pose.push);
    const blend = pose.walkBlend != null ? clamp01(pose.walkBlend) : (pose.moving ? 1 : 0);
    const walk = { phase: pose.walkPhase || 0, blend };
    let dir = pose.dir || (pose.facing < 0 ? 'left' : 'right');
    let sx = 1;
    if (pose.turn && C.TURN_MS > 0) { // 방향 전환: 이전 방향으로 좁아졌다가 새 방향으로 펴진다
      const t = Math.min(1, pose.turn.t / C.TURN_MS);
      if (t < 0.5) { dir = pose.turn.from; sx = 1 - 1.6 * t; }
      else sx = 0.2 + 1.6 * (t - 0.5);
    }

    ctx.save();
    if (strain > 0) ctx.translate(0, Math.sin((pose.time || 0) * 70) * H * 0.008 * strain); // 힘줄 때 미세 떨림
    if (sx !== 1) ctx.scale(sx, 1);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = LINE;
    ctx.fillStyle = FILL;
    if (dir === 'down') drawFrontBack(ctx, H, false, c, strain, push, walk);
    else if (dir === 'up') drawFrontBack(ctx, H, true, c, strain, push, walk);
    else drawSide(ctx, H, dir === 'left' ? -1 : 1, c, strain, push, walk);
    ctx.restore();
  }

  PD.character = { draw };
})();
