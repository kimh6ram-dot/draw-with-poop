/* 똥으로 그리세요 — 부트스트랩: 화면 흐름(INTRO → PLAY → RESULT), 버튼, 확인창, 게임 루프, 저장 */
(function () {
  'use strict';

  const PD = window.PD;
  const C = PD.CONFIG;
  const S = PD.STATE;
  const $ = id => document.getElementById(id);

  const app = $('app');
  const canvas = $('stage');
  const hudCount = $('hud-count');
  const btnUndo = $('btn-undo'), btnReset = $('btn-reset'), btnDone = $('btn-done');
  const btnPoop = $('btn-poop');
  const btnSave = $('btn-save'), btnAgain = $('btn-again');
  const hint = $('hint');

  /* ---------- 터치 기기 판별 (D-pad 노출, 저장 방식) ---------- */
  const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  if (coarse) document.body.classList.add('touch');
  window.addEventListener('touchstart', () => document.body.classList.add('touch'), { once: true, passive: true });
  const isTouch = () => document.body.classList.contains('touch');

  PD.renderer.init(canvas);
  PD.world.setEventHandler(PD.sfx.play); // 배변 단계 이벤트(stop/squat/strain/poop/land/rise) → 효과음 연결 지점
  if (C.CHARACTER_3D && C.CHARACTER_3D.enabled !== false && PD.character3d) PD.character3d.init(); // 실패하면 2D 선화 폴백

  /* 글자 속 똥 아이콘(HUD 카운트·싸기 버튼·결과 문구·안내)도 전부 1번 에셋 이미지로 */
  const POOP_ICON_SRC = (window.PD_SPRITES && window.PD_SPRITES[C.POOP_VARIANTS[0].id] || {}).src || '';
  const poopIconHtml = () => POOP_ICON_SRC ? '<img class="poop-icon" src="' + POOP_ICON_SRC + '" alt="똥">' : '💩 ';
  document.querySelectorAll('img.poop-icon').forEach(img => { if (POOP_ICON_SRC) img.src = POOP_ICON_SRC; else img.replaceWith('💩 '); });

  /* ---------- 크기 ---------- */
  let viewW = 0, viewH = 0;
  function handleResize() {
    const r = app.getBoundingClientRect();
    viewW = r.width; viewH = r.height;
    PD.renderer.resize(viewW, viewH);
    // PC(마우스·넓은 화면)는 캐릭터·똥이 작아 보여 배율을 1.25배 올린다(그림 좌표·비율은 그대로). 플레이 중이면 즉시 반영
    const pc = !isTouch() && viewW >= C.PC_MIN_WIDTH;
    PD.camera.setPlayScale(pc ? C.CAMERA_SCALE_PC : C.CAMERA_SCALE, PD.state.current !== S.RESULT);
    PD.camera.setView(viewW, viewH);
    updateArea();
    if (PD.state.current === S.RESULT) fitResult(false);
  }
  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', handleResize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', handleResize);

  /* 이동 가능 영역(월드 좌표) = 화면 사각형 − 상단 HUD − 하단 조작 영역(터치: D-pad/💩, PC: 키 안내) − 여백.
   * 카메라가 고정이라 화면 ↔ 월드는 중심 기준 배율 변환뿐이다. HUD/조작이 숨겨진 상태(인트로)면 레이아웃값으로 추정 */
  function updateArea() {
    const cam = PD.camera.get(), s = cam.scale;
    if (!(viewW > 0 && viewH > 0 && s > 0)) return;
    const appTop = app.getBoundingClientRect().top;
    const rectOf = el => { const r = el && el.getBoundingClientRect(); return r && r.height > 0 ? { top: r.top - appTop, bottom: r.bottom - appTop } : null; };
    const hudR = rectOf($('hud'));
    const hudBottom = hudR ? hudR.bottom : 52;                       // 6px 패딩 + 40px 버튼 + 여유
    let ctrlTop = viewH - (isTouch() ? 196 : 24);                     // 터치: D-pad 3×60 + 바닥 8 + 여유 / PC: 하단 여백(키 안내 라벨 없음 — 안내 문구에 포함)
    const dpadR = rectOf($('dpad')), poopR = rectOf($('btn-poop'));
    const tops = [dpadR, poopR].filter(Boolean).map(r => r.top);
    if (tops.length) ctrlTop = Math.min.apply(null, tops);
    const unit = px => px / s;
    const left = cam.x - unit(viewW / 2), right = cam.x + unit(viewW / 2), top = cam.y - unit(viewH / 2), bottom = cam.y + unit(viewH / 2);
    PD.world.setArea({
      minX: left + C.AREA_SIDE_INSET,
      maxX: right - C.AREA_SIDE_INSET,
      minY: top + unit(hudBottom) + C.CHARACTER_HEIGHT * 1.05 + C.AREA_TOP_EXTRA, // 머리 꼭대기(발 기준 위로 키만큼)가 HUD 아래
      maxY: top + unit(ctrlTop) - C.AREA_BOTTOM_EXTRA,                               // 발이 조작 영역 위
    });
  }

  /* ---------- 마우스 클릭 → 그 지점으로 걸어간다(PC). 터치는 D-pad 와 섞이지 않게 제외. 클릭 좌표(화면) → 월드: 카메라 고정이라 중심 기준 배율 변환 ---------- */
  canvas.addEventListener('pointerdown', e => {
    if (PD.state.current !== S.PLAYING || modalOpen) return;
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const r = app.getBoundingClientRect(), cam = PD.camera.get();
    PD.world.setTarget(cam.x + (e.clientX - r.left - viewW / 2) / cam.scale, cam.y + (e.clientY - r.top - viewH / 2) / cam.scale);
  });

  /* ---------- 확인창 ---------- */
  const modal = $('modal'), modalTitle = $('modal-title'), modalOk = $('modal-ok'), modalCancel = $('modal-cancel');
  let modalOpen = false;
  let onOk = null;
  function openConfirm(title, okLabel, fn) {
    modalTitle.textContent = title;
    modalOk.textContent = okLabel;
    onOk = fn;
    modal.classList.add('open');
    modalOpen = true;
    PD.input.setEnabled(false);
  }
  function closeConfirm() {
    modal.classList.remove('open');
    modalOpen = false;
    onOk = null;
    if (PD.state.current === S.PLAYING) PD.input.setEnabled(true);
  }
  modalCancel.addEventListener('click', closeConfirm);
  modalOk.addEventListener('click', () => { const fn = onOk; closeConfirm(); if (fn) fn(); });

  /* ---------- 저장 폴백 미리보기 ---------- */
  const saveModal = $('save-modal'), saveImg = $('save-img'), saveHint = $('save-hint');
  function showSavePreview(dataUrl) {
    saveImg.src = dataUrl;
    saveHint.textContent = isTouch()
      ? '저장이 안 됐다면 이미지를 길게 눌러 저장하세요'
      : '다운로드가 안 됐다면 이미지를 우클릭해 저장하세요';
    saveModal.classList.add('open');
  }
  $('save-close').addEventListener('click', () => { saveModal.classList.remove('open'); saveImg.src = ''; });

  /* ---------- 안내 문구(처음 한 번): 첫 똥을 쌀 때까지 보인다. 위치는 CSS 고정(화면 중앙 = 캐릭터 시작 위치 아래 44px),
   * 캐릭터를 따라가지 않는다. PC 의 'SPACE 싸기' 안내도 여기에 포함(우하단 별도 라벨 없음) ---------- */
  let hintDismissed = false;
  function updateHint(snap) {
    const show = !hintDismissed && snap.stats.poops === 0;
    if (show && !hint.innerHTML) {
      hint.innerHTML = isTouch()
        ? '이동해서 원하는 곳에 서세요\n' + poopIconHtml() + '싸기로 하나씩 그려보세요'
        : '방향키로 이동해서 원하는 곳에 서세요\nSPACE 싸기로 하나씩 그려보세요';
    }
    hint.classList.toggle('show', show);
    if (snap.stats.poops > 0) hintDismissed = true;
  }

  /* ---------- HUD ---------- */
  let lastCount = -1, lastLen = -1;
  function updateHud(snap) {
    if (snap.stats.poops !== lastCount) {
      lastCount = snap.stats.poops;
      hudCount.textContent = String(lastCount); // 아이콘은 index.html의 <img class="poop-icon">가 담당
    }
    if (snap.poops.length !== lastLen) {
      lastLen = snap.poops.length;
      btnUndo.disabled = lastLen === 0;
      btnDone.disabled = lastLen === 0;
    }
  }

  /* ---------- 흐름 ---------- */
  function startGame() {
    PD.sfx.unlock();
    PD.world.reset();
    PD.camera.reset(C.START_X, C.START_Y); // 고정 카메라: 월드 중심 = 화면 중앙
    updateArea();
    lastCount = -1; lastLen = -1;
    PD.state.set(S.PLAYING);
  }
  function restartDrawing() {
    PD.world.reset();
    PD.camera.reset(C.START_X, C.START_Y);
    updateArea();
    lastCount = -1; lastLen = -1;
  }

  PD.state.on(S.INTRO, () => { PD.input.setEnabled(false); });
  PD.state.on(S.PLAYING, () => { PD.input.setEnabled(true); requestAnimationFrame(updateArea); }); // HUD/조작이 표시된 뒤 실측
  PD.state.on(S.RESULT, () => {
    PD.input.setEnabled(false);
    hint.classList.remove('show');
    const st = PD.world.snapshot().stats;
    $('res-count').textContent = '총 ' + st.poops + '번 쌌어요'; // 아이콘은 index.html의 <img class="poop-icon">가 담당
    $('res-time').textContent = '⏱ ' + PD.export.formatTime(st.playTime) + ' 걸렸어요';
    $('res-dist').textContent = '🚶 ' + PD.export.formatDistance(st.distance) + ' 걸었어요';
    fitResult(true);
  });

  /* 결과: 제목과 기록 사이(result-middle) 영역에 작품 전체를 맞춘다 */
  function fitResult(animate) {
    // offset* 는 진입 fade(translateY 4px)의 transform 영향을 받지 않는다 — 전환 중에 재도 최종 위치 기준
    const mid = $('result-middle');
    const rect = { x: mid.offsetLeft, y: mid.offsetTop, w: mid.offsetWidth, h: mid.offsetHeight };
    if (rect.w < 10 || rect.h < 10) return;
    const target = PD.camera.fitBounds(PD.world.bounds(), rect, PD.camera.playScale * C.RESULT_MAX_SCALE);
    PD.camera.tweenTo(target, animate ? C.RESULT_TWEEN_MS : 0);
  }

  /* ---------- 버튼 ---------- */
  $('btn-start').addEventListener('click', startGame);
  btnUndo.addEventListener('click', () => { PD.world.undo(); });
  btnReset.addEventListener('click', () => {
    openConfirm('정말 처음부터 다시 그릴까요?', '처음부터', restartDrawing);
  });
  btnDone.addEventListener('click', () => {
    if (!PD.world.snapshot().poops.length) return;
    openConfirm('그림을 완성할까요?', '완성', () => PD.state.set(S.RESULT));
  });
  btnAgain.addEventListener('click', () => {
    openConfirm('새로 그릴까요?\n지금 작품은 사라집니다', '다시 그리기', startGame);
  });

  let saving = false;
  async function saveArtwork() {
    if (saving) return;
    saving = true;
    btnSave.disabled = true;
    try {
      const snap = PD.world.snapshot();
      const cnv = PD.export.buildImage(snap);
      const res = await PD.export.save(cnv, PD.export.filename(snap));
      if (res.status === 'saved' || res.status === 'failed') showSavePreview(res.dataUrl);
    } finally {
      saving = false;
      btnSave.disabled = false;
    }
  }
  btnSave.addEventListener('click', saveArtwork);

  PD.input.setHandlers({
    poop: () => { if (!modalOpen) PD.world.requestPoop(); },
    undo: () => { if (!modalOpen) PD.world.undo(); },
  });
  PD.input.attachDpad($('dpad'));
  PD.input.attachButton(btnPoop, () => { if (!modalOpen) PD.world.requestPoop(); });

  /* ---------- 루프 ---------- */
  let last = null;
  function loop(ts) {
    if (last === null) last = ts;
    let dt = (ts - last) / 1000;
    last = ts;
    if (!(dt > 0)) dt = 0;
    if (dt > C.MAX_DT) dt = C.MAX_DT;

    const st = PD.state.current;
    if (st === S.PLAYING && !modalOpen) {
      PD.world.update(dt, PD.input.state, PD.input.takePresses()); // 카메라는 고정(추적 없음) — 화면·똥은 그대로, 캐릭터만 움직인다
    } else if (st === S.RESULT) {
      PD.camera.updateTween(dt);
    }
    const snap = PD.world.snapshot();
    PD.renderer.render(snap, PD.camera.get(), { showCharacter: st !== S.RESULT, showMarker: st === S.PLAYING });
    if (st === S.PLAYING) { updateHud(snap); updateHint(snap); }
    requestAnimationFrame(loop);
  }

  /* ---------- 시작 ---------- */
  PD.world.reset();
  handleResize();
  PD.state.set(S.INTRO);
  requestAnimationFrame(loop);
  // 똥 PNG·캐릭터 스프라이트(base64 내장) 로드 — 인트로는 사진(assets/main.png)이라 로드 완료 콜백이 필요 없다
  PD.sprites.load(() => {});
  if (PD.characterSprite && C.CHARACTER_SPRITE && C.CHARACTER_SPRITE.enabled !== false) {
    PD.characterSprite.load(() => {});
  }

  window.PD_DEBUG = {
    get world() { return PD.world; }, get camera() { return PD.camera; }, get state() { return PD.state; },
    startGame, restartDrawing, fitResult, saveArtwork, buildImage: () => PD.export.buildImage(PD.world.snapshot()),
    get modalOpen() { return modalOpen; }, get viewW() { return viewW; }, get viewH() { return viewH; }, updateArea,
  };
})();
