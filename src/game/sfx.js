/* 똥으로 그리세요 — 효과음 연결 지점(현재는 에셋이 없어 아무 소리도 내지 않는다).
 * world 가 배변 단계마다 이벤트를 보낸다: stop · squat · strain · poop(나오는 순간) · land(바닥 착지) · rise
 * 나중에 짧은 캐주얼 효과음(예: 착지 "뿅")이 오면 SOURCES 에 경로만 넣으면 된다. 임의의 소리를 만들어 넣지 않는다. */
'use strict';
window.PD = window.PD || {};

PD.sfx = (function () {
  const SOURCES = {
    // squat: 'assets/sfx/squat.mp3',
    // strain: 'assets/sfx/strain.mp3',
    // poop: 'assets/sfx/poop.mp3',
    // land: 'assets/sfx/land.mp3',
  };
  const pool = {};
  let unlocked = false;

  function unlock() { unlocked = true; } // 첫 사용자 제스처 이후에만 재생(모바일 자동재생 정책)

  function play(name) {
    const src = SOURCES[name];
    if (!src || !unlocked) return;
    try {
      let a = pool[name];
      if (!a) { a = new Audio(src); a.preload = 'auto'; pool[name] = a; }
      a.currentTime = 0;
      const p = a.play();
      if (p && p.catch) p.catch(() => {});
    } catch (_) { /* 효과음 실패는 게임을 막지 않는다 */ }
  }

  return { play, unlock, SOURCES };
})();
