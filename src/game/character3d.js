/* 똥으로 그리세요 — 3D 캐릭터(Three.js r149, 절차적 리그). 게임 로직은 world.js에 있고 여기엔 "그림"만 있다.
 *
 * 왜 3D: 정면·후면·측면·대각선을 하나의 모델을 실제로 회전시켜 보여주고(튀거나 뒤집히지 않음), 다리는 2관절 IK로
 * 발을 바닥에 심은 채 무릎·고관절이 굽혀진다. 외부 모델 파일 없이 구(머리)·캡슐(팔다리)·타원구(몸통)로 조립한
 * 2.3등신 무광(Lambert) 캐릭터. 색·치수·카메라는 config.CHARACTER_3D.
 *
 * 합성 방식: 투명 WebGL 캔버스에 캐릭터만 그린 뒤 기존 2D 캔버스에 drawImage(발 기준점 맞춤). 똥·카메라·저장·UI 무관.
 * WebGL 이 없으면 ready=false → renderer 가 2D 선화(character.js)로 폴백.
 *
 * 호출 규약(character.js 와 같은 pose): { state, dir, face:{x,y}, crouch, strain, push, walkPhase, walkBlend, moving, time, snapYaw? }
 *   draw(ctx, sx, sy, scale, dpr, pose) — (sx, sy) = 발 중심 화면 CSS px, scale = 월드→CSS 배율 */
'use strict';
window.PD = window.PD || {};

PD.character3d = (function () {
  const C = PD.CONFIG;
  const K = C.CHARACTER_3D;
  const MODEL_HEIGHT = 4.58;                       // 머리 꼭대기까지(모델 단위, 머리 반지름 1) ≈ 2.3등신
  const FR = { w: 6.0, h: 5.8, lookY: 2.1 };      // 직교 카메라 프레임(모델 단위)
  const L1 = 0.62, L2 = 0.58, ANKLE_Y = 0.20;     // 허벅지·정강이 길이, 발목 높이(신발)
  const HIP_STAND = L1 + L2 + ANKLE_Y;             // 1.40

  let ready = false;
  let renderer, scene, camera, glCanvas;
  let rig = null, J = null;                        // J = 관절/메시 참조
  let cssW = 0, cssH = 0, curUnitPx = 0, curDpr = 0, anchorX = 0, anchorY = 0;
  let yawVis = 0, lastTime = null;
  let blinkSeed = 0;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  function mat(hex) { return new THREE.MeshLambertMaterial({ color: hex }); }
  function sphere(r, hex, seg) { return new THREE.Mesh(new THREE.SphereGeometry(r, seg || 18, seg ? Math.round(seg * 0.7) : 13), mat(hex)); }
  /* 관절(y=0)에서 아래로 길이 L 만큼 뻗는 캡슐 팔다리 */
  function limb(L, r, hex) {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.01, L - 2 * r), 4, 12), mat(hex));
    m.position.y = -L / 2;
    return m;
  }

  function buildRig() {
    const col = K.colors;
    rig = new THREE.Group();
    J = {};

    const pelvis = new THREE.Group(); rig.add(pelvis); J.pelvis = pelvis;

    // 상체(척추 그룹: 숙임의 축) — 몸통 타원구 + 어깨/팔 + 목/머리
    const spine = new THREE.Group(); spine.position.y = 0.25; pelvis.add(spine); J.spine = spine;
    const torso = sphere(1, col.shirt, 22); torso.scale.set(0.60, 0.72, 0.54); torso.position.y = 0.33; spine.add(torso);
    const hem = sphere(1, col.pants, 18); hem.scale.set(0.52, 0.30, 0.46); hem.position.y = -0.12; pelvis.add(hem); // 엉덩이/바지 위

    const neck = new THREE.Group(); neck.position.y = 0.92; spine.add(neck);
    const head = new THREE.Group(); neck.add(head); J.head = head;
    const skull = sphere(1.0, col.skin, 28); skull.position.y = 0.95; head.add(skull);
    // 머리카락: 둥근 캡(정수리~눈썹 위). 얼굴은 적도부터 아래가 보인다
    const hair = new THREE.Mesh(new THREE.SphereGeometry(1.06, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.46), mat(col.hair));
    hair.position.y = 0.95; head.add(hair);
    const eyeGeo = new THREE.SphereGeometry(0.085, 10, 8);
    const eyeL = new THREE.Mesh(eyeGeo, mat(col.eye)); eyeL.position.set(-0.32, 0.95 - 0.02, 0.95); head.add(eyeL);
    const eyeR = new THREE.Mesh(eyeGeo, mat(col.eye)); eyeR.position.set(0.32, 0.95 - 0.02, 0.95); head.add(eyeR);
    J.eyes = [eyeL, eyeR];
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.05), mat(col.mouth)); mouth.position.set(0, 0.95 - 0.34, 0.95); head.add(mouth); J.mouth = mouth;

    J.arms = [-1, 1].map(side => {
      const sh = new THREE.Group(); sh.position.set(side * 0.60, 0.80, 0); spine.add(sh);
      sh.add(limb(0.42, 0.16, col.shirt));
      const el = new THREE.Group(); el.position.y = -0.42; sh.add(el);
      el.add(limb(0.38, 0.15, col.skin));
      const hand = sphere(0.17, col.skin, 12); hand.position.y = -0.38; el.add(hand);
      return { side, sh, el };
    });

    J.legs = [-1, 1].map(side => {
      const hip = new THREE.Group(); hip.position.set(side * 0.26, 0, 0); pelvis.add(hip);
      hip.add(limb(L1, 0.20, col.pants));
      const knee = new THREE.Group(); knee.position.y = -L1; hip.add(knee);
      knee.add(limb(L2, 0.18, col.pants));
      const ankle = new THREE.Group(); ankle.position.y = -L2; knee.add(ankle);
      const shoe = sphere(1, col.shoe, 14); shoe.scale.set(0.26, 0.15, 0.34); shoe.position.set(0, -0.05, 0.07); ankle.add(shoe);
      return { side, hip, knee, ankle };
    });

    scene.add(rig);
  }

  function init() {
    if (ready) return true;
    if (!window.THREE) return false;
    try {
      glCanvas = document.createElement('canvas');
      renderer = new THREE.WebGLRenderer({ canvas: glCanvas, alpha: true, antialias: true });
      renderer.setClearColor(0x000000, 0);
      scene = new THREE.Scene();
      camera = new THREE.OrthographicCamera(-FR.w / 2, FR.w / 2, FR.h / 2, -FR.h / 2, 0.1, 100);
      const tilt = (K.cameraTiltDeg || 16) * Math.PI / 180, dist = 20;
      camera.position.set(0, FR.lookY + dist * Math.sin(tilt), dist * Math.cos(tilt));
      camera.lookAt(0, FR.lookY, 0);
      camera.updateProjectionMatrix();
      scene.add(new THREE.AmbientLight(0xffffff, K.ambient != null ? K.ambient : 0.85));
      const sun = new THREE.DirectionalLight(0xffffff, K.sun != null ? K.sun : 0.55);
      sun.position.set(1.5, 3, 2.5); scene.add(sun);
      buildRig();
      ready = true;
    } catch (e) {
      console.warn('3D 캐릭터를 쓸 수 없어 2D 선화로 폴백합니다:', e && e.message);
      ready = false;
    }
    return ready;
  }

  function setSize(unitPx, dpr) {
    curUnitPx = unitPx; curDpr = dpr;
    cssW = FR.w * unitPx; cssH = FR.h * unitPx;
    renderer.setPixelRatio(dpr);
    renderer.setSize(cssW, cssH, false);
    const v = new THREE.Vector3(0, 0, 0).project(camera); // 발 중심(모델 원점)이 캔버스 어디에 찍히는지
    anchorX = (v.x + 1) / 2 * cssW;
    anchorY = (1 - v.y) / 2 * cssH;
  }

  /* 2관절 IK: 고관절(hipY, hipZ) → 발목 목표(ty, tz). 발(신발)은 항상 수평 유지 */
  function solveLeg(leg, hipY, hipZ, ty, tz) {
    const dy = hipY - ty, dz = tz - hipZ;
    let d = Math.hypot(dy, dz);
    d = clamp(d, 0.05, L1 + L2 - 0.004);
    const base = Math.atan2(dz, dy);
    const a1 = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    const inner = Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
    const thigh = base + a1, flex = Math.PI - inner;
    leg.hip.rotation.x = -thigh;
    leg.knee.rotation.x = flex;
    leg.ankle.rotation.x = thigh - flex;
  }

  function applyPose(pose, dt) {
    const c = clamp(pose.crouch || 0, 0, 1), strain = clamp(pose.strain || 0, 0, 1), push = clamp(pose.push || 0, 0, 1);
    const bl = pose.walkBlend != null ? clamp(pose.walkBlend, 0, 1) : (pose.moving ? 1 : 0);
    const ph = pose.walkPhase || 0;
    const time = pose.time || 0;

    // 방향: face 벡터 → yaw(+Z 가 보는 사람 쪽). 짧은 쪽으로 부드럽게 회전
    const f = pose.face || (pose.dir === 'left' ? { x: -1, y: 0 } : pose.dir === 'up' ? { x: 0, y: -1 } : pose.dir === 'down' ? { x: 0, y: 1 } : { x: 1, y: 0 });
    const yawT = Math.atan2(f.x, f.y);
    if (pose.snapYaw || lastTime === null) yawVis = yawT;
    else {
      let d = yawT - yawVis;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      yawVis += d * (1 - Math.exp(-dt / (K.yawTau || 0.07)));
    }
    rig.rotation.y = yawVis;

    // 골반: 서 있을 때 1.40 → 앉으면 0.58(+힘줄 때 조금 더), 걸을 때 살짝 들썩
    const bob = -0.04 * Math.abs(Math.sin(ph)) * bl;
    const hipY = lerp(HIP_STAND, 0.58, c) - push * 0.03 + bob;
    const hipZ = -0.22 * c;
    J.pelvis.position.set(0, hipY, hipZ);

    // 다리: 발목 목표(발은 바닥에 심어짐). 걷기 = 앞뒤 왕복 + 앞으로 나갈 때만 들림. 앉기 = 발이 조금 앞으로
    J.legs.forEach((leg, i) => {
      const p = ph + (i === 0 ? 0 : Math.PI);
      const walkZ = 0.42 * Math.sin(p) * bl;
      const lift = Math.max(0, Math.cos(p)) * 0.22 * bl;
      const tz = lerp(walkZ, 0.22, c);
      const ty = ANKLE_Y + lift * (1 - c);
      solveLeg(leg, hipY, hipZ, ty, tz);
    });

    // 상체: 앉으면 앞으로 숙임(+힘줄 때 조금 더), 걸을 때 미세 흔들림. 머리는 절반만 따라가(얼굴이 너무 숙여지지 않게)
    const lean = 0.38 * c + 0.10 * push + 0.05 * bl;
    J.spine.rotation.x = lean;
    J.spine.rotation.z = 0.035 * Math.sin(ph) * bl;
    J.head.rotation.x = -lean * 0.55 + push * 0.06;
    J.head.rotation.z = -0.5 * J.spine.rotation.z;
    if (strain > 0) J.head.position.y = Math.sin(time * 70) * 0.012 * strain; else J.head.position.y = 0; // 힘줄 때 미세 떨림

    // 팔: 서면 늘어뜨리고 걸을 때 다리와 반대로 작게 스윙, 앉으면 앞으로 내려 무릎 쪽에
    J.arms.forEach((arm, i) => {
      const swing = Math.sin(ph + (i === 0 ? Math.PI : 0)) * 0.45 * bl;
      arm.sh.rotation.x = lerp(-swing, -1.15, c);
      arm.sh.rotation.z = arm.side * lerp(0.12, 0.28, c);
      arm.el.rotation.x = lerp(-0.22, -0.55, c);
    });

    // 얼굴: 힘줄 때 눈 질끈 + 입 오므림. 평소엔 가끔 깜빡임
    let eyeS = lerp(1, 0.22, strain);
    if (K.blink !== false && strain < 0.3) {
      const period = 3.6, t = (time + blinkSeed) % period;
      if (t < 0.12) eyeS *= 0.12;
    }
    J.eyes.forEach(e => { e.scale.y = eyeS; });
    J.mouth.scale.x = lerp(1, 0.55, strain);
    J.mouth.position.y = 0.95 - 0.34 - 0.04 * strain;
  }

  /* (sx, sy) = 발 중심 화면 CSS px. 성공하면 true, 준비 안 됐으면 false(호출 쪽이 2D 폴백) */
  function draw(ctx, sx, sy, scale, dpr, pose) {
    if (!ready) return false;
    const unitPx = C.CHARACTER_HEIGHT * scale / MODEL_HEIGHT;
    if (unitPx !== curUnitPx || dpr !== curDpr) setSize(unitPx, dpr);
    const time = pose.time || 0;
    const dt = lastTime === null ? 0 : clamp(time - lastTime, 0, 0.1);
    applyPose(pose, dt);
    lastTime = time;
    renderer.render(scene, camera);
    if (K.contactShadow !== false) { // 발밑 옅은 접지 그림자(2D 캔버스에)
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,' + (K.contactShadowAlpha != null ? K.contactShadowAlpha : 0.07) + ')';
      ctx.beginPath();
      ctx.ellipse(sx, sy + 1.5 * scale, 0.95 * unitPx * (1 + 0.15 * (pose.crouch || 0)), 0.32 * unitPx, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.drawImage(glCanvas, sx - anchorX, sy - anchorY, cssW, cssH);
    return true;
  }

  function resetSmoothing() { lastTime = null; }

  return { init, draw, resetSmoothing, get ready() { return ready; }, getYaw: () => yawVis, MODEL_HEIGHT };
})();
