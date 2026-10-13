/* 똥으로 그리세요 — 게임 로직(그림과 완전히 분리).
 * 캐릭터 위치·방향(8방향 face + 4방향 dir), 이동, 배변 루프 상태 머신, 똥 목록, 통계, 되돌리기/초기화.
 *
 * 배변 루프: requestPoop() → idle일 때만 수락
 *   stop(걸음 멈춤) → squat(앉기) → strain(힘주기) → [똥 1개 생성] poop(똥이 나와 떨어짐, 앉은 채) → rise(일어남) → idle
 * 루프가 도는 동안 이동·방향 전환·탭·추가 요청은 전부 무시된다(큐에 쌓지도 않는다).
 * 똥 생성은 strain→poop 전이 한 곳(spawn)에서만 일어나므로 "한 번 앉음 = 정확히 1개"가 구조적으로 보장된다.
 * 똥은 { x, y } = 최종(바닥) 위치, { sx, sy } = 나오는 지점, f = 연출 중 캐릭터 앞에 그릴지, t = 생성 시각, v = 그림 종류.
 *
 * 방향: face = 마지막 이동 방향의 단위벡터(8방향, 3D 캐릭터는 이 각도로 실제 회전), dir = 가장 가까운 4방향(2D 폴백·스프라이트용).
 * 시각 전용 값(좌표에 영향 없음): walkPhase(이동 거리 기반), walkBlend(걷기 시작/정지 보간), turn(2D 폴백의 방향 전환 보간).
 *
 * 이벤트(효과음 연결 지점): setEventHandler(fn) → fn('stop'|'squat'|'strain'|'poop'|'land'|'rise') */
'use strict';
window.PD = window.PD || {};

PD.world = (function () {
  const C = PD.CONFIG;

  const s = {
    x: 0, y: 0,
    face: { x: 1, y: 0 }, dir: 'right', facing: 1,   // facing = 옆모습 좌우(±1), 상하 방향일 땐 마지막 값 유지
    moving: false, walkPhase: 0, walkBlend: 0, walkDist: 0, turn: null,
    action: 'idle', actionT: 0, crouch: 0, strain: 0, push: 0,
    time: 0,
    poops: [],                                  // { x, y, sx, sy, f, t, v } — 생성 순서대로, 생성 후 불변
    stats: { poops: 0, distance: 0, playTime: 0 }, // poops = 실제 배변 횟수(되돌려도 줄지 않음)
    landPending: false,
  };
  const heldMs = { up: 0, down: 0, left: 0, right: 0 }; // 방향별 누르고 있는 시간(배변 중에도 누적 → 끝나면 바로 정상 속도)
  let onEvent = null;
  /* 이동 가능 영역(월드 좌표, 발 기준점). 카메라가 고정이므로 main 이 "화면에서 HUD·조작 영역·여백을 뺀 사각형"을 월드로 환산해 넣는다.
   * 없으면 월드 전체. 경계에 닿으면 그 축만 막히고(반동·흔들림 없음) 다른 축은 즉시 움직인다 */
  let area = null;
  let targetMs = 0;                                                   // 클릭 목표로 걷기 시작한 뒤 경과(ms) — 키와 같은 느림→정상 램프
  function setArea(a) {
    area = a ? { minX: Math.min(a.minX, a.maxX), maxX: Math.max(a.minX, a.maxX), minY: Math.min(a.minY, a.maxY), maxY: Math.max(a.minY, a.maxY) } : null;
    if (area) { s.x = clamp(s.x, area.minX, area.maxX); s.y = clamp(s.y, area.minY, area.maxY); } // 창이 줄어 밖에 놓이면 가장 가까운 경계로
  }
  function getArea() { return area; }
  /* 마우스 클릭 목표(이동 영역 안으로 clamp). 발이 그 지점에 서도록 걷는다. 키/D-pad 입력·배변 요청이 들어오면 취소 */
  function setTarget(x, y) {
    const tx = area ? clamp(x, area.minX, area.maxX) : clamp(x, 0, C.WORLD_W);
    const ty = area ? clamp(y, area.minY, area.maxY) : clamp(y, 0, C.WORLD_H);
    s.target = { x: tx, y: ty }; targetMs = 0;
  }
  /* QA/디버그용 위치 설정(영역 안으로 clamp). 게임 UI에서는 쓰지 않는다 */
  function setPosition(x, y) {
    s.x = area ? clamp(x, area.minX, area.maxX) : clamp(x, 0, C.WORLD_W);
    s.y = area ? clamp(y, area.minY, area.maxY) : clamp(y, 0, C.WORLD_H);
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 2); }
  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function emit(name) { if (onEvent) { try { onEvent(name); } catch (_) { /* 효과음 실패는 게임을 막지 않는다 */ } } }

  const DIR_FACE = { right: { x: 1, y: 0 }, left: { x: -1, y: 0 }, down: { x: 0, y: 1 }, up: { x: 0, y: -1 } };

  function reset() {
    s.x = C.START_X; s.y = C.START_Y;
    s.dir = C.INITIAL_DIR || 'right';
    s.face = Object.assign({}, DIR_FACE[s.dir] || DIR_FACE.right);
    s.facing = s.dir === 'left' ? -1 : 1;
    s.moving = false; s.walkPhase = 0; s.walkBlend = 0; s.walkDist = 0; s.turn = null;
    s.action = 'idle'; s.actionT = 0; s.crouch = 0; s.strain = 0; s.push = 0;
    s.time = 0;
    s.poops = [];
    s.stats = { poops: 0, distance: 0, playTime: 0 };
    s.landPending = false;
    s.target = null; targetMs = 0;
    for (const k in heldMs) heldMs[k] = 0;
    prevAxes = 0; releaseMs = 0;
  }

  /* 바라보는 방향(face)에 따른 똥 위치: { spawn:{x,y}, ground:{x,y}, front } — 발 중심 기준 월드 유닛 */
  function offsetsFor(face) {
    const fx = face.x, fy = face.y;
    const G = C.POOP_GROUND, S = C.POOP_SPAWN;
    return {
      ground: { x: -fx * G.behind, y: -fy * G.depth + (1 - Math.abs(fy)) * G.side },
      spawn: { x: -fx * S.behind, y: -S.up - Math.max(0, fy) * S.frontExtra },
      front: fy <= 0.3,
    };
  }
  /* 배변은 항상 옆모습(마지막 가로 방향)으로 돌아서 한다 — 스프라이트 시트에 배변 프레임이 옆모습만 있다.
   * 그래서 똥 위치도 항상 옆 기준(엉덩이 뒤 = 바라보는 가로 방향의 반대)이고, 생성 지점 표시(마커)도 이 값을 쓴다. */
  function squatFace() { return { x: s.facing < 0 ? -1 : 1, y: 0 }; }
  /* 최종(바닥) 위치 = 그림 좌표 */
  function spawnPoint() { const o = offsetsFor(squatFace()).ground; return { x: s.x + o.x, y: s.y + o.y }; }
  /* 나오는 지점(엉덩이 아래) */
  function emergePoint() { const o = offsetsFor(squatFace()).spawn; return { x: s.x + o.x, y: s.y + o.y }; }

  /* 배변 요청. idle 이 아니면 거절(false). 옆으로 돌아서서 시작한다. */
  function requestPoop() {
    if (s.action !== 'idle') return false;
    s.action = 'stop';
    s.actionT = 0;
    s.moving = false;
    s.walkDist = 0;
    s.target = null; targetMs = 0;                                     // 여기서 싸겠다는 뜻 — 클릭 목표는 버린다
    s.face = squatFace();
    s.dir = s.facing < 0 ? 'left' : 'right';
    emit('stop');
    return true;
  }

  /* 똥 그림 종류(config.POOP_VARIANTS 가중치) — 점수/결과와 무관한 겉모습만 고른다 */
  function pickVariant() {
    const vs = C.POOP_VARIANTS || [];
    let total = 0;
    for (let i = 0; i < vs.length; i++) total += Math.max(0, vs[i].weight || 0);
    if (total <= 0) return 0;
    let r = Math.random() * total;
    for (let i = 0; i < vs.length; i++) { r -= Math.max(0, vs[i].weight || 0); if (r < 0) return i; }
    return 0;
  }

  function spawn() {
    const o = offsetsFor(squatFace());
    s.poops.push({ x: s.x + o.ground.x, y: s.y + o.ground.y, sx: s.x + o.spawn.x, sy: s.y + o.spawn.y, f: o.front, t: s.time, v: pickVariant() });
    s.stats.poops++;
    s.landPending = true;
  }

  function undo() {
    if (!s.poops.length) return false;
    s.poops.pop();
    s.landPending = false;
    return true;
  }

  /* 누르고 있는 시간 → 속도 배율 (느림 → 램프 → 정상) */
  function holdFactor(ms) {
    if (ms < C.HOLD_DELAY_MS) return C.SLOW_FACTOR;
    const t = (ms - C.HOLD_DELAY_MS) / C.HOLD_RAMP_MS;
    return t >= 1 ? 1 : C.SLOW_FACTOR + (1 - C.SLOW_FACTOR) * t;
  }

  function moveBy(dx, dy) {
    const nx = area ? clamp(s.x + dx, area.minX, area.maxX) : clamp(s.x + dx, 0, C.WORLD_W);
    const ny = area ? clamp(s.y + dy, area.minY, area.maxY) : clamp(s.y + dy, 0, C.WORLD_H);
    const d = Math.hypot(nx - s.x, ny - s.y);
    s.stats.distance += d;
    // 걸음 위상에 아직 반영 못 한 거리. 상한을 둬서(반 걸음) 오래 걸은 뒤 멈춰도 다리가 계속 허우적대지 않게 한다
    s.walkDist = Math.min(s.walkDist + d, C.WALK_STRIDE * 0.5);
    s.x = nx; s.y = ny;
  }

  /* 바라보는 방향 갱신: face = 입력 벡터(8방향 단위), dir = 가장 가까운 4방향(같으면 가로)
   * 두 키(대각선)에서 한 키를 먼저 뗀 직후의 짧은 한 축 입력은 FACE_RELEASE_GRACE_MS 동안 무시한다 —
   * 사람 손은 두 키를 동시에 못 떼므로, 그대로 두면 대각선으로 걷다 멈출 때마다 몸이 45° 움찔한다.
   * 정지 상태에서의 새 입력(탭 포함)과 키를 추가하는 경우는 즉시 반영한다. */
  let prevAxes = 0, releaseMs = 0;
  function updateDir(dx, dy, dt) {
    const axes = (dx ? 1 : 0) + (dy ? 1 : 0);
    if (axes === 0) { prevAxes = 0; releaseMs = 0; return; }
    if (axes < prevAxes) {
      releaseMs += (dt || 0) * 1000;
      if (releaseMs < C.FACE_RELEASE_GRACE_MS) return; // 아직 유예 중: 이전(대각선) 방향 유지
    }
    releaseMs = 0;
    prevAxes = axes;
    const len = Math.hypot(dx, dy);
    s.face = { x: dx / len, y: dy / len };
    const next = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    if (next !== s.dir) { s.turn = { from: s.dir, t: 0 }; s.dir = next; }
    if (next === 'left') s.facing = -1;
    else if (next === 'right') s.facing = 1;
  }

  /* 시각 전용: 걷기 블렌드·걸음 위상·턴 타이머 */
  function updateVisual(dt, movedNow) {
    // 아직 소화 못 한 이동 거리(탭 한 걸음 등)가 남아 있으면 그 걸음을 마저 내딛는 동안은 "걷는 중"으로 본다
    const walking = movedNow || s.walkDist > 0.01;
    if (walking) s.walkBlend = Math.min(1, s.walkBlend + dt * 1000 / C.WALK_BLEND_IN_MS);
    else s.walkBlend = Math.max(0, s.walkBlend - dt * 1000 / C.WALK_BLEND_OUT_MS);
    if (s.walkDist > 0) {
      const want = s.walkDist / C.WALK_STRIDE * Math.PI;
      const cap = C.WALK_MAX_STEP_HZ * Math.PI * dt;
      const adv = Math.min(want, cap);
      s.walkPhase += adv;
      s.walkDist = Math.max(0, s.walkDist - adv / Math.PI * C.WALK_STRIDE);
      if (s.walkDist < 0.01) s.walkDist = 0;
    }
    if (!walking && s.walkBlend === 0) { s.walkPhase = 0; s.walkDist = 0; }
    if (s.turn) { s.turn.t += dt * 1000; if (s.turn.t >= C.TURN_MS) s.turn = null; }
  }

  /* 똥 착지 이벤트: 마지막 똥이 바닥에 닿는 순간(EMERGE+FALL) 한 번 */
  function checkLanding() {
    if (!s.landPending || !s.poops.length) return;
    const last = s.poops[s.poops.length - 1];
    if ((s.time - last.t) * 1000 >= C.POOP_EMERGE_MS + C.POOP_FALL_MS) { s.landPending = false; emit('land'); }
  }

  /* input = { up, down, left, right } (지금 누르고 있는지), presses = 이번 프레임의 누름 에지 횟수(없으면 null) */
  function update(dt, input, presses) {
    dt = Math.min(Math.max(0, dt), C.MAX_DT);
    s.time += dt;
    s.stats.playTime += dt;
    for (const k in heldMs) heldMs[k] = input[k] ? heldMs[k] + dt * 1000 : 0;
    checkLanding();

    if (s.action !== 'idle') {
      // 배변 중: 이동·방향·탭 전부 무시(presses는 호출 쪽이 매 프레임 소비하므로 큐에 남지 않는다)
      s.moving = false;
      updateVisual(dt, false);
      s.actionT += dt * 1000;
      const T = s.actionT;
      switch (s.action) {
        case 'stop': // 걸음을 멈추고 발 위치를 잡는다(걷기 블렌드가 자연히 빠진다)
          s.crouch = 0; s.strain = 0; s.push = 0;
          if (T >= C.STOP_MS) { s.action = 'squat'; s.actionT = 0; emit('squat'); }
          break;
        case 'squat': // 무릎을 굽히며 상체를 살짝 숙이고 엉덩이를 충분히 낮춘다
          s.crouch = easeInOut(Math.min(1, T / C.SQUAT_MS));
          s.strain = 0; s.push = 0;
          if (T >= C.SQUAT_MS) { s.action = 'strain'; s.actionT = 0; s.crouch = 1; emit('strain'); }
          break;
        case 'strain': { // 완전히 앉은 채 잠깐 정지 + 작은 힘주기(꿈틀) — 이 구간이 끝나야 똥이 나온다
          s.crouch = 1; s.strain = 1;
          const u = Math.min(1, T / C.STRAIN_MS);
          s.push = Math.pow(Math.sin(u * Math.PI * C.STRAIN_PULSES), 2);
          if (T >= C.STRAIN_MS) { spawn(); s.action = 'poop'; s.actionT = 0; s.push = 0; emit('poop'); }
          break;
        }
        case 'poop': { // 똥이 엉덩이 아래에서 나와 떨어지는 동안 앉은 채. 힘은 서서히 풀린다
          const dur = C.POOP_EMERGE_MS + C.POOP_FALL_MS;
          s.crouch = 1; s.push = 0;
          s.strain = 1 - Math.min(1, T / dur);
          if (T >= dur) { s.action = 'rise'; s.actionT = 0; s.strain = 0; emit('rise'); }
          break;
        }
        case 'rise': // 무릎을 펴며 빠르게 일어난다(똥의 착지 squash 는 이 동안 재생). 시트의 마지막 프레임이 정면이라 일어나면 정면을 본다
          s.crouch = 1 - easeOut(Math.min(1, T / C.RISE_MS));
          s.strain = 0; s.push = 0;
          if (T >= C.RISE_MS) { s.action = 'idle'; s.actionT = 0; s.crouch = 0; s.face = { x: 0, y: 1 }; s.dir = 'down'; }
          break;
        default:
          s.action = 'idle';
      }
      return;
    }

    // ---- idle: 이동 ----
    let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);

    // 1) 누른 순간의 한 걸음(탭). 같은 프레임에 여러 번 눌려도 한 걸음만.
    let tapX = 0, tapY = 0;
    if (presses) {
      tapX = (presses.right > 0 ? 1 : 0) - (presses.left > 0 ? 1 : 0);
      tapY = (presses.down > 0 ? 1 : 0) - (presses.up > 0 ? 1 : 0);
      if (tapX && tapY) { tapX *= Math.SQRT1_2; tapY *= Math.SQRT1_2; }
      if (tapX || tapY) moveBy(tapX * C.TAP_STEP, tapY * C.TAP_STEP);
    }

    // 2) 누르고 있는 동안의 연속 이동(축별 누름 시간에 따라 느림 → 정상). 대각선은 정규화
    let vx = 0, vy = 0;
    if (dx) vx = dx * C.MOVEMENT_SPEED * holdFactor(dx > 0 ? heldMs.right : heldMs.left);
    if (dy) vy = dy * C.MOVEMENT_SPEED * holdFactor(dy > 0 ? heldMs.down : heldMs.up);
    if (vx && vy) { vx *= Math.SQRT1_2; vy *= Math.SQRT1_2; }
    if (vx || vy) moveBy(vx * dt, vy * dt);

    // 3) 마우스 클릭 목표 지점으로 걷기(PC). 키/D-pad 입력이 있으면 목표를 버리고 키를 따른다
    let cx = 0, cy = 0;
    if (dx || dy || tapX || tapY) { s.target = null; targetMs = 0; }
    else if (s.target) {
      const tx = s.target.x - s.x, ty = s.target.y - s.y, dist = Math.hypot(tx, ty);
      if (dist < 0.01) { s.target = null; targetMs = 0; }
      else {
        targetMs += dt * 1000;
        const step = Math.min(dist, C.MOVEMENT_SPEED * holdFactor(targetMs) * dt);
        cx = tx / dist; cy = ty / dist;
        const bx = s.x, by = s.y;
        moveBy(cx * step, cy * step);
        if (s.x === bx && s.y === by) { s.target = null; targetMs = 0; }                 // 영역에 막혀 한 발짝도 못 가면 포기(리사이즈로 목표가 영역 밖이 된 경우)
        else if (Math.hypot(s.target.x - s.x, s.target.y - s.y) < 0.01) { s.target = null; targetMs = 0; }
      }
    }

    updateDir(dx || tapX || cx, dy || tapY || cy, dt);
    const movedNow = !!(vx || vy || tapX || tapY || cx || cy);
    s.moving = movedNow;
    updateVisual(dt, movedNow);
    s.crouch = 0; s.strain = 0; s.push = 0;
  }

  /* 똥 전체의 경계(월드, 최종 위치 기준). 똥이 없으면 캐릭터 위치 기준 작은 박스 */
  function bounds() {
    const r = C.POOP_SIZE / 2;
    if (!s.poops.length) return { minX: s.x - r, maxX: s.x + r, minY: s.y - r, maxY: s.y + r };
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < s.poops.length; i++) {
      const p = s.poops[i];
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
    return { minX: minX - r, maxX: maxX + r, minY: minY - r, maxY: maxY + r };
  }

  /* 현재 phase 안에서의 진행도 0..1 (스프라이트 프레임 선택용) */
  function phaseProgress() {
    const dur = { stop: C.STOP_MS, squat: C.SQUAT_MS, strain: C.STRAIN_MS, poop: C.POOP_EMERGE_MS + C.POOP_FALL_MS, rise: C.RISE_MS }[s.action];
    return dur ? Math.min(1, s.actionT / dur) : 0;
  }

  /* 렌더러/UI용 스냅샷 — poops 배열은 복사하지 않는다(참조, 읽기 전용)
   * pose.state = walk | idle | stop | squat | strain | poop | rise, pose.face = 8방향 단위벡터, pose.dir = 4방향
   * (3D 캐릭터는 face 로 회전, 스프라이트 교체 시 state + dir 조합으로 프레임을 고른다) */
  function snapshot() {
    return {
      x: s.x, y: s.y, action: s.action, time: s.time, dir: s.dir,
      target: s.target ? { x: s.target.x, y: s.target.y } : null,
      poops: s.poops, stats: s.stats, spawn: spawnPoint(),
      pose: {
        state: s.action === 'idle' ? (s.moving ? 'walk' : 'idle') : s.action,
        t: phaseProgress(),
        dir: s.dir, facing: s.facing, face: { x: s.face.x, y: s.face.y },
        crouch: s.crouch, strain: s.strain, push: s.push,
        walkPhase: s.walkPhase, walkBlend: s.walkBlend, moving: s.moving,
        turn: s.turn ? { from: s.turn.from, t: s.turn.t } : null,
        time: s.time,
      },
    };
  }

  function setEventHandler(fn) { onEvent = typeof fn === 'function' ? fn : null; }

  return { reset, update, requestPoop, undo, bounds, snapshot, spawnPoint, emergePoint, offsetsFor, setEventHandler, pickVariant, setArea, getArea, setPosition, setTarget,
    get busy() { return s.action !== 'idle'; } };
})();
