/* 똥으로 그리세요 — 튜닝값 모음.
 * 명세(GAME_SPEC_POOP_DRAW.md)에 수치가 없는 값은 전부 여기에 모아 두고 README "정한 값"에 적는다.
 * 캐릭터 그림·똥 그림을 PNG로 바꿔도 이 파일의 값(오프셋·크기·시간)만 손보면 되게 분리한다.
 * 3차(2026-10-07): "UI는 극단적으로 단순, 배변 모션은 쓸데없이 디테일" — 배변을 6단계로 쪼개고
 * 똥을 spawn(엉덩이) → fall → ground(착지·squash)로 분리. */
'use strict';
window.PD = window.PD || {};

PD.CONFIG = {
  /* ---------- 월드(도화지) — 단위: 월드 유닛(cameraScale 1일 때 CSS px와 같다) ---------- */
  WORLD_W: 4000,
  WORLD_H: 4000,
  START_X: 2000,                 // 캐릭터 시작 위치(월드 중앙)
  START_Y: 2000,

  /* ---------- 캐릭터 ---------- */
  CHARACTER_HEIGHT: 54,          // 서 있을 때 키(월드 유닛). 화면상(배율 1.1)은 약 59px
  INITIAL_DIR: 'down',           // 시작 방향: down(정면, 얼굴이 보임) | right | left | up(후면, 뒷모습) — 2026-10-13 정면으로
  /* 스프라이트 캐릭터(character-sprite.js) — 사용자 제공 시트가 최종 기준. 로드 실패 시 아래 3D/2D 로 폴백 */
  CHARACTER_SPRITE: {
    enabled: true,
    walkLoopFrames: 12,          // 시트 걷기 루프 프레임 수(1~12). 13·14 는 정면으로 돌아서는 정지 프레임(미사용)
    bobUnits: 0.04,              // 부위 조각이 없는 방향(아래 대각선 등)에서 서 있는 프레임을 위아래로 흔드는 양(서 있는 키 비율)
    /* 정면·후면 걷기(부위 분리 애니메이션, 8차) — 서 있는 키 비율 / 라디안 */
    frontLift: 0.05,             // 다리를 번갈아 들어 올리는 높이
    frontBob: 0.015,             // 걸음마다 몸통이 들썩이는 양
    frontArmSwing: 0.14,         // 팔이 소매 끝을 축으로 흔들리는 각도(rad), 다리와 반대 위상
  },
  /* 3D 캐릭터(character3d.js, Three.js 절차적 리그) — 스프라이트 적용 후 기본 꺼짐(파일은 남겨 둠). 켜려면 index.html 에 lib/three.min.js 와 character3d.js 를 다시 넣는다 */
  CHARACTER_3D: {
    enabled: false,
    colors: { skin: 0xF2CDA4, hair: 0x2E2622, shirt: 0x8A9AA5, pants: 0x4B4F57, shoe: 0x2B2B2B, eye: 0x1A1A1A, mouth: 0x7A4A3A }, // 절제된 무광 톤
    cameraTiltDeg: 16,           // 살짝 내려다보는 각도
    ambient: 0.85, sun: 0.55,    // 조명(부드럽게, 광택 없음)
    yawTau: 0.07,                // 방향 전환 보간 시간 상수(초) — 몸이 실제로 돌아간다
    blink: true,                 // 가끔 눈 깜빡임
    contactShadow: true, contactShadowAlpha: 0.07, // 발밑 옅은 접지 그림자(2D 캔버스)
  },

  /* ---------- 걷기·방향 전환(전부 "시각"만 — 좌표는 입력에 즉시 반응) ----------
   * 걸음 위상은 시간이 아니라 실제 이동 거리로 진행한다(미끄러짐 방지). 한 걸음(반 주기) = WALK_STRIDE 유닛.
   * 정상 속도 160/20 = 초당 8걸음이라 WALK_MAX_STEP_HZ 로 상한을 두어 다리가 허우적대지 않게 한다(남는 거리는 다음 프레임에 소화). */
  WALK_STRIDE: 20,
  WALK_MAX_STEP_HZ: 7,
  WALK_BLEND_IN_MS: 90,          // 걷기 시작: 보폭이 0→정상으로 커지는 시간(첫걸음 연결)
  WALK_BLEND_OUT_MS: 140,        // 정지: 현재 다리 위치에서 기본 자세로 돌아오는 시간
  TURN_MS: 120,                  // (2D 폴백) 방향 전환: 몸을 돌리는 시간(가로로 좁아졌다 새 방향으로 펴짐)
  FACE_RELEASE_GRACE_MS: 80,     // 대각선(두 키)에서 한 키를 먼저 뗐을 때, 남은 한 축이 이 시간 이상 유지돼야 그쪽을 바라본다(멈출 때 45° 움찔 방지)
  /* 대각선(두 키 동시)일 때 바라보는 방향: 현재 방향이 두 축 중 하나면 그대로 유지(떨림 방지), 아니면 가로 우선 */

  /* ---------- 이동: "짧게 톡 = 조금, 길게 = 계속 걷기" ----------
   * 누르는 순간 TAP_STEP 만큼 즉시 한 걸음 → HOLD_DELAY_MS 동안은 SLOW_FACTOR 속도로 살금살금
   * → HOLD_RAMP_MS 에 걸쳐 정상 속도로 올라간다. 떼면 즉시 정지(관성 없음). */
  MOVEMENT_SPEED: 160,           // 정상 속도(유닛/초)
  TAP_STEP: 6,                   // 누르는 순간 즉시 이동하는 한 걸음(유닛)
  HOLD_DELAY_MS: 140,            // 이 시간까지는 느린 속도
  HOLD_RAMP_MS: 120,             // 느린 속도 → 정상 속도로 올라가는 시간
  SLOW_FACTOR: 0.25,             // 느린 구간 속도 배율

  /* ---------- 배변 모션(ms) — 입력 잠금 구간 합계 = STOP+SQUAT+STRAIN+EMERGE+FALL+RISE = 0.95초 ----------
   * 입력 → stop(걸음 멈춤·발 위치 잡음) → squat(무릎 굽히며 상체 살짝 숙여 완전히 쪼그려 앉음)
   * → strain(완전히 앉은 채 정지 + 작은 힘주기 2회) → poop(엉덩이 아래에서 똥이 나와 짧게 낙하)
   * → rise(똥이 착지하는 동안 무릎 펴며 빠르게 일어남) → idle
   * 똥 착지 squash(POOP_LAND_MS)는 rise 와 겹쳐 재생된다(사이클이 길어지지 않게). */
  STOP_MS: 50,
  SQUAT_MS: 200,
  STRAIN_MS: 250,
  STRAIN_PULSES: 2,              // 힘주기 동안 몸이 꿈틀하는 횟수
  RISE_MS: 200,

  /* ---------- 똥: spawn(엉덩이 아래) → fall → ground(최종 위치) — 바라보는 방향(face 단위벡터, 8방향)에 따라 ----------
   * 발 중심 기준 월드 유닛(world.offsetsFor(face)). f = face, 화면 아래(+y)가 보는 사람 쪽.
   *   ground = ( -f.x·behind,  -f.y·depth + (1-|f.y|)·side )   옆: 엉덩이 뒤(∓14, +5) · 정면(down): 몸 뒤(0, −6) · 후면(up): 발 앞(0, +6)
   *   spawn  = ( -f.x·behind,  -up - max(0, f.y)·frontExtra )  앉은 엉덩이 높이에서 나온다
   *   front  = f.y <= 0.3 (정면·정면 대각선은 몸 뒤에 떨어져 다리 사이로 보인다)
   * 그림 좌표는 생성 즉시 ground 로 고정(낙하 중에도 불변). */
  POOP_SIZE: 19,                 // 가로 폭(월드 유닛). 화면상 약 21px
  POOP_GROUND: { behind: 14, depth: 6, side: 5 },
  POOP_SPAWN: { behind: 11, up: 8, frontExtra: 4 },
  POOP_EMERGE_MS: 100,           // 엉덩이 아래에서 작게 → 거의 제 크기로 나오는 시간
  POOP_FALL_MS: 150,             // 짧은 낙하(중력 ease-in)
  POOP_LAND_MS: 80,              // 착지 squash → 복원
  POOP_LAND_SQUASH: 0.16,        // 착지 순간 scaleX +16% / scaleY −16% (젤리처럼 튀지 않게 작게)
  SHOW_SPAWN_MARKER: true,       // idle 상태에서 똥이 놓일 자리에 옅은 점 표시. false로 끌 수 있음
  /* 똥 그림 = 사용자 에셋 assets/poop_1~3.png (tools/build-sprites.js → sprites-data.js 로 base64 내장).
   * 1번이 기준: 가장 자주 나오고(weight) 크기 기준(scale 1.0 = 가로 폭 POOP_SIZE). 2·3번은 가끔 섞이는 변형.
   * 1번만 쓰려면 나머지 weight 를 0으로. 똥마다 생성 시점에 한 번 고르고(p.v) 이후 바뀌지 않는다. */
  POOP_VARIANTS: [
    { id: 'poop_1', weight: 1, scale: 1.00 }, // 2026-10-12: 사용자 지시로 poop_1 만 사용(2·3 삭제)
  ],
  POOP_COLORS: { fill: '#8B5A2B', line: '#3E2A14', light: '#B8835A' }, // 스프라이트 로드 전/실패 시 벡터 폴백 색

  /* ---------- 카메라(9차: 플레이 중 완전 고정) ----------
   * 카메라는 월드 중심(START)에 고정되고 화면 중앙 = 월드 중심. 캐릭터가 움직여도 화면·똥은 그대로다.
   * 창 크기가 바뀌어도 카메라를 옮기지 않으므로 작품의 상대 배치·형태가 유지된다(똥 데이터 무변경). 결과 화면 프레이밍은 별도(fitBounds). */
  CAMERA_SCALE: 1.1,             // 플레이 중 배율(월드 유닛 → CSS px) — 모바일
  CAMERA_SCALE_PC: 1.375,        // PC(마우스·폭 PC_MIN_WIDTH 이상): 1.25배 — 캐릭터·똥이 같이 커지고 그림 좌표는 그대로
  PC_MIN_WIDTH: 600,
  /* 이동 가능 영역 = 화면에서 상단 HUD·하단 조작 영역을 뺀 사각형. 발 기준점 기준 여백(월드 유닛):
   * 좌우 = 캐릭터 반폭 + 옆에 싸는 똥(뒤 14 + 반지름 10)이 화면 안에 들어오게, 위 = 머리 꼭대기가 HUD 아래, 아래 = 발이 조작 영역 위 */
  AREA_SIDE_INSET: 30,
  AREA_TOP_EXTRA: 6,
  AREA_BOTTOM_EXTRA: 8,
  CAMERA_DEADZONE_W: 0.30,       // (미사용 — 추적 카메라 시절 값, camera.follow 참고용)
  CAMERA_DEADZONE_H: 0.24,
  CAMERA_DEADZONE_CY: 0.42,
  CAMERA_SMOOTH: 7,

  /* ---------- 완성 시 자동 프레이밍(결과 화면·저장 이미지 공용) ---------- */
  RESULT_FIT_PAD_RATIO: 0.05,    // 작품 긴 변 대비 여백 비율
  RESULT_FIT_PAD_MIN: 16,        // 화면 px 기준 최소 여백(가장자리에 딱 붙지 않게)
  RESULT_MAX_SCALE: 3,           // 똥 몇 개뿐일 때 과하게 확대되지 않도록 상한(플레이 배율의 배수)
  RESULT_TWEEN_MS: 450,          // 현재 카메라 → 전체 프레이밍 보간 시간

  /* ---------- 통계 ---------- */
  METERS_PER_UNIT: 1.7 / 54,     // 캐릭터 키 54유닛 = 1.7m 로 환산("142m 걸었어요")

  /* ---------- 저장 이미지 ---------- */
  EXPORT_W: 1080,
  EXPORT_H: 1920,
  EXPORT_ART: { x: 60, y: 250, w: 960, h: 1340 },  // 작품 영역(면적의 대부분)
  EXPORT_MAX_SCALE: 4,           // 저장 이미지에서 똥 최대 확대 배율

  TITLE: '똥으로 그리세요',
  HANDLE: '@ccojik.dh',
  /* ---- 응모(이벤트): 정적 페이지라 서버 발송 없음. Gmail 웹 작성 화면(새 탭)을 열어 받는 사람·제목·본문만 채운다 ---- */
  APPLY_EMAIL: 'kimh6ram@gmail.com',
  APPLY_SUBJECT: '[똥으로 그리세요] 응모',
  MAX_DT: 0.05,                  // 탭 전환 후 복귀 시 튐 방지(초)
};

PD.FONT = 'Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif';
