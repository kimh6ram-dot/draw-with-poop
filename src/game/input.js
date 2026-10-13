/* 똥으로 그리세요 — 입력 (주차하기 input.js 골격 + WASD·SPACE·Ctrl+Z)
 * PC: WASD / 방향키 이동, SPACE 똥 싸기, Ctrl(⌘)+Z 되돌리기
 * 모바일: D-pad(포인터 캡처, 멀티터치 동시 입력) + 💩 싸기 버튼
 * 결과: PD.input.state = { up, down, left, right }. 배변/되돌리기는 콜백 1회 호출(연타·repeat는 world가 잠근다). */
(function () {
  'use strict';

  const PD = window.PD;

  const state = { up: false, down: false, left: false, right: false };
  const KEYS = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
  };
  let enabled = false;
  const held = { up: 0, down: 0, left: 0, right: 0 }; // 버튼별 누르고 있는 포인터 수
  const keyDown = { up: false, down: false, left: false, right: false };
  const presses = { up: 0, down: 0, left: 0, right: 0 }; // 누름 에지 횟수(프레임 사이에 눌렀다 떼도 world가 한 걸음은 받는다)
  let dpadEl = null;
  const cb = { poop: null, undo: null };

  function sync() {
    for (const k in state) state[k] = keyDown[k] || held[k] > 0;
  }

  function reset() {
    for (const k in state) { keyDown[k] = false; held[k] = 0; state[k] = false; presses[k] = 0; }
    if (dpadEl) dpadEl.querySelectorAll('.dpad-btn.on').forEach(b => b.classList.remove('on'));
  }

  function setEnabled(v) {
    enabled = !!v;
    if (!enabled) reset();
  }

  function setHandlers(h) {
    if (h.poop) cb.poop = h.poop;
    if (h.undo) cb.undo = h.undo;
  }

  window.addEventListener('keydown', e => {
    if (!enabled) return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
      e.preventDefault();
      if (!e.repeat && cb.undo) cb.undo();
      return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      if (e.repeat) return;
      if (cb.poop) cb.poop();
      return;
    }
    const dir = KEYS[e.code];
    if (!dir) return;
    e.preventDefault();
    if (e.repeat) return;
    if (!keyDown[dir]) presses[dir]++;
    keyDown[dir] = true;
    sync();
  });
  window.addEventListener('keyup', e => {
    const dir = KEYS[e.code];
    if (!dir) return;
    keyDown[dir] = false;
    sync();
  });
  window.addEventListener('blur', reset);
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });

  /* 모바일 방향 버튼: Pointer Events + 포인터 캡처 → 버튼마다 독립적으로 눌림/뗌 (동시 입력) */
  function attachDpad(el) {
    dpadEl = el;
    el.querySelectorAll('.dpad-btn').forEach(btn => {
      const dir = btn.dataset.dir;
      const pointers = new Set();
      const press = e => {
        if (!enabled) return;
        e.preventDefault();
        if (pointers.has(e.pointerId)) return;
        pointers.add(e.pointerId);
        try { btn.setPointerCapture(e.pointerId); } catch (_) { /* 미지원 무시 */ }
        if (held[dir] === 0) presses[dir]++;
        held[dir]++;
        btn.classList.add('on');
        sync();
      };
      const release = e => {
        if (!pointers.has(e.pointerId)) return;
        pointers.delete(e.pointerId);
        held[dir] = Math.max(0, held[dir] - 1);
        if (held[dir] === 0) btn.classList.remove('on');
        sync();
      };
      btn.addEventListener('pointerdown', press);
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('lostpointercapture', release);
      btn.addEventListener('contextmenu', e => e.preventDefault());
    });
  }

  /* 💩 싸기 버튼: pointerdown 1회 = 요청 1회. 길게 눌러도 반복되지 않는다(연속 배변 금지). */
  function attachButton(btn, fn) {
    btn.addEventListener('pointerdown', e => {
      e.preventDefault(); // 포커스 이동 방지(이후 SPACE가 버튼 click으로 중복 발화하지 않게)
      if (!enabled) return;
      btn.classList.add('on');
      fn();
    });
    const off = () => btn.classList.remove('on');
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointercancel', off);
    btn.addEventListener('pointerleave', off);
    btn.addEventListener('contextmenu', e => e.preventDefault());
  }

  /* 이번 프레임까지 쌓인 누름 에지를 돌려주고 비운다(world.update 가 매 프레임 소비) */
  function takePresses() {
    const out = { up: presses.up, down: presses.down, left: presses.left, right: presses.right };
    presses.up = presses.down = presses.left = presses.right = 0;
    return out;
  }

  PD.input = { state, reset, setEnabled, setHandlers, attachDpad, attachButton, takePresses };
})();
