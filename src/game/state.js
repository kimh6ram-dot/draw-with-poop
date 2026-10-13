/* 똥으로 그리세요 — 상태 머신 (INTRO → PLAYING → RESULT). 비누 잡기 state.js 골격 그대로.
 * 화면 섹션(#screen-*) 전환 + 진입 fade + body[data-state]만 담당. PLAYING은 전용 섹션이 없고
 * 캔버스/HUD/컨트롤이 body[data-state="play"]로 켜진다. */
(function () {
  'use strict';

  const PD = window.PD;

  PD.STATE = {
    INTRO: 'intro',
    PLAYING: 'play',
    RESULT: 'result',
  };
  const SCREEN_OF = { intro: 'intro', play: 'play', result: 'result' };

  let current = null;
  const handlers = Object.create(null);

  function set(next, payload) {
    const prev = current;
    current = next;
    const screen = SCREEN_OF[next];
    document.querySelectorAll('.screen').forEach(s => {
      const active = s.id === 'screen-' + screen;
      const wasActive = s.classList.contains('active');
      s.classList.toggle('active', active);
      if (active && !wasActive) {
        s.classList.add('entering');
        void s.offsetHeight; // 강제 리플로우: entering 시작 상태를 먼저 페인트
        requestAnimationFrame(() => s.classList.remove('entering'));
      }
    });
    document.body.dataset.state = next;
    (handlers[next] || []).forEach(fn => fn(payload, prev));
  }
  function on(name, fn) {
    (handlers[name] = handlers[name] || []).push(fn);
  }

  PD.state = { set, on, get current() { return current; } };
})();
