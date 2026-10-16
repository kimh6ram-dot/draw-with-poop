/* 똥으로 그리세요 — 헤드리스 QA (BUILD_TEMPLATE §7)
 * playwright-core + 로컬 Chrome 으로 file:// 를 열어 흐름·4방향·걷기·배변 루프(6단계)·똥 낙하 연출·입력·프레이밍·저장·성능을 숫자로 확인한다.
 * 사용법: node tools/qa.js   (스크린샷은 screenshot/qa-*.png, 배변/방향 프레임은 qa-motion-*.png · qa-dir-*.png) */
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const { chromium } = require(path.join(ROOT, '..', '..', '260624', 'build', 'node_modules', 'playwright-core'));
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');
const SHOT = path.join(ROOT, 'screenshot');
fs.mkdirSync(SHOT, { recursive: true });

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  PASS ' + name + (detail ? '  (' + detail + ')' : '')); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '  (' + detail + ')' : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const snap = page => page.evaluate(() => {
  const s = PD_DEBUG.world.snapshot();
  const last = s.poops[s.poops.length - 1];
  const anim = last ? PD.renderer.poopAnim(last, s.time) : null;
  return { x: s.x, y: s.y, action: s.action, n: s.poops.length, poops: s.poops.slice(-3), stats: Object.assign({}, s.stats),
    dir: s.pose.dir, facing: s.pose.facing, face: s.pose.face, crouch: s.pose.crouch, push: s.pose.push, poseState: s.pose.state,
    walkPhase: s.pose.walkPhase, walkBlend: s.pose.walkBlend, turn: s.pose.turn, anim, state: PD_DEBUG.state.current,
    yaw: PD.character3d && PD.character3d.ready ? PD.character3d.getYaw() : null };
});
const near = (a, b, tol) => Math.abs(a - b) <= tol;

async function openPage(browser, opts) {
  const ctx = await browser.newContext(Object.assign({ acceptDownloads: true }, opts));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL);
  await page.waitForFunction(() => window.PD_DEBUG && PD_DEBUG.state.current === 'intro');
  await sleep(300);
  const CFG = await page.evaluate(() => PD.CONFIG);
  CFG._cycle = CFG.STOP_MS + CFG.SQUAT_MS + CFG.STRAIN_MS + CFG.POOP_EMERGE_MS + CFG.POOP_FALL_MS + CFG.RISE_MS;
  return { ctx, page, errors, CFG };
}

async function hold(page, key, ms) { await page.keyboard.down(key); await sleep(ms); await page.keyboard.up(key); await sleep(40); }
/* 고정 화면이라 이동 영역이 화면 크기(모바일 약 295×484유닛)뿐 — 오른쪽으로 계속 걷는 검사들 앞에서 중앙으로 되돌린다 */
async function recenter(page) { await page.evaluate(() => { const a = PD_DEBUG.world.getArea(); if (a) PD_DEBUG.world.setPosition((a.minX + a.maxX) / 2, (a.minY + a.maxY) / 2); }); await sleep(60); }
async function holdMany(page, keys, ms) { for (const k of keys) await page.keyboard.down(k); await sleep(ms); for (const k of keys) await page.keyboard.up(k); await sleep(40); }
async function poopAndWait(page, CFG) { await page.keyboard.press('Space'); await sleep(CFG._cycle + 150); }
const offsetsOf = (CFG, fx, fy) => ({
  ground: { x: -fx * CFG.POOP_GROUND.behind, y: -fy * CFG.POOP_GROUND.depth + (1 - Math.abs(fy)) * CFG.POOP_GROUND.side },
  spawn: { x: -fx * CFG.POOP_SPAWN.behind, y: -CFG.POOP_SPAWN.up - Math.max(0, fy) * CFG.POOP_SPAWN.frontExtra },
  front: fy <= 0.3,
});
const groundOf = (CFG, s, fx, fy) => { const o = offsetsOf(CFG, fx, fy).ground; return { x: s.x + o.x, y: s.y + o.y }; };

async function mobileFlow(browser) {
  console.log('\n[모바일 390×844 · 터치]');
  const { ctx, page, errors, CFG } = await openPage(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const cycleMs = CFG._cycle;
  console.log('  config: 키 ' + CFG.CHARACTER_HEIGHT + ' · 똥 ' + CFG.POOP_SIZE + ' · 배율 ' + CFG.CAMERA_SCALE + ' · 속도 ' + CFG.MOVEMENT_SPEED + ' · 탭 ' + CFG.TAP_STEP +
    ' · 사이클 ' + cycleMs + 'ms · 보폭 ' + CFG.WALK_STRIDE + ' · 턴 ' + CFG.TURN_MS + 'ms');
  await page.screenshot({ path: path.join(SHOT, 'qa-01-intro-390.png') });
  const pv = await page.evaluate(() => { const im = document.getElementById('intro-img'); const r = im.getBoundingClientRect(); return { ok: im.complete && im.naturalWidth > 0, nw: im.naturalWidth, nh: im.naturalHeight, w: r.width, h: r.height, src: im.getAttribute('src') }; });
  check('인트로 메인 사진(assets/main.png) 로드 · 폭 180 · 비율 유지', pv.ok && pv.src === 'assets/main.png' && near(pv.w, 180, 1) && near(pv.h, 180 * pv.nh / pv.nw, 1.5), pv.nw + 'x' + pv.nh + ' → ' + pv.w.toFixed(0) + 'x' + pv.h.toFixed(0));

  // 시작
  await page.tap('#btn-start');
  await sleep(250);
  let s = await snap(page);
  check('시작 → PLAYING', s.state === 'play');
  check('D-pad 노출(터치)', await page.$eval('#dpad', el => getComputedStyle(el).display === 'grid'));
  check('안내 문구 노출', await page.$eval('#hint', el => el.classList.contains('show')));
  const hintPos = await page.evaluate(() => {
    const s = PD_DEBUG.world.snapshot(), cam = PD.camera.get(), app = document.getElementById('app').getBoundingClientRect();
    const sx = app.width / 2 + (s.x - cam.x) * cam.scale, sy = app.height / 2 + (s.y - cam.y) * cam.scale;
    const h = document.getElementById('hint').getBoundingClientRect();
    const count = document.querySelector('.hud-count').getBoundingClientRect(), acts = document.querySelector('.hud-actions').getBoundingClientRect();
    return { dx: (h.left + h.right) / 2 - app.left - sx, dy: h.top - app.top - sy, w: h.width, countOff: (count.left + count.right) / 2 - (app.left + app.right) / 2, gap: acts.left - count.right, rowDiff: Math.abs((count.top + count.bottom) / 2 - (acts.top + acts.bottom) / 2) };
  });
  check('안내 문구: 시작 위치(화면 중앙) 아래 44px · 가로 중심 · 캐릭터와 간격', Math.abs(hintPos.dx) < 2 && hintPos.dy >= 40 && hintPos.dy <= 48 && hintPos.w > 100, 'dx=' + hintPos.dx.toFixed(1) + ' dy=' + hintPos.dy.toFixed(1) + ' w=' + hintPos.w.toFixed(0));
  check('HUD 카운트: 화면 가운데(±4px) · 버튼과 겹침 없음 · 같은 줄', Math.abs(hintPos.countOff) < 4 && hintPos.gap >= 0 && hintPos.rowDiff < 3, 'off=' + hintPos.countOff.toFixed(1) + ' gap=' + hintPos.gap.toFixed(0));
  const uiStyle = await page.evaluate(() => {
    const cs = el => getComputedStyle(el);
    const hudBtn = cs(document.querySelector('.hud-btn')), dpadBtn = cs(document.querySelector('.dpad-btn')), poop = cs(document.getElementById('btn-poop')), label = cs(document.querySelector('.poop-btn-label'));
    const transparent = c => c === 'rgba(0, 0, 0, 0)' || c === 'transparent';
    return { hudBorder: hudBtn.borderStyle, hudBg: transparent(hudBtn.backgroundColor), dpadBg: transparent(dpadBtn.backgroundColor), dpadBorder: dpadBtn.borderStyle,
      poopBg: transparent(poop.backgroundColor), poopBorder: poop.borderStyle, labelBorder: label.borderWidth, hudH: document.querySelector('.hud-btn').getBoundingClientRect().height,
      titleInPlay: !!document.querySelector('body[data-state="play"] .screen.active .game-title') };
  });
  check('플레이 UI: HUD 버튼 박스 없음(테두리·배경 없음)', uiStyle.hudBorder === 'none' && uiStyle.hudBg, 'border=' + uiStyle.hudBorder);
  check('플레이 UI: D-pad 박스 없음', uiStyle.dpadBorder === 'none' && uiStyle.dpadBg);
  check('플레이 UI: 💩 터치 영역 투명, 라벨만 1px 테두리', uiStyle.poopBg && uiStyle.poopBorder === 'none' && uiStyle.labelBorder === '1px');
  check('플레이 UI: 제목 없음', !uiStyle.titleInPlay);
  check('텍스트 버튼 터치 높이 ≥ 36', uiStyle.hudH >= 36, uiStyle.hudH.toFixed(0));

  // 똥 에셋(PNG) 로드 + 종류 분포(1번이 기준) + 글자 속 아이콘
  const spr = await page.evaluate(() => {
    const ids = PD.CONFIG.POOP_VARIANTS.map(v => v.id);
    const ok = PD.sprites.isLoaded() && ids.every(id => PD.sprites.get(id) && PD.sprites.get(id).img.naturalWidth > 0);
    const c = PD.CONFIG.POOP_VARIANTS.map(() => 0);
    for (let i = 0; i < 3000; i++) c[PD_DEBUG.world.pickVariant()]++;
    const sp = PD.renderer.poopSprite(PD.CONFIG.CAMERA_SCALE * 2, 0);
    return { ok, ids, c, spW: sp.w, spH: sp.h };
  });
  check('똥 PNG 3종 로드', spr.ok, spr.ids.join(','));
  const cs = await page.evaluate(() => { const S = PD.characterSprite; const n = S ? Object.keys(S.frames).length : 0; const f = S && S.frames.idle_front; return { ready: !!(S && S.ready), n, loaded: !!(f && f.img.naturalWidth > 0), three: !!window.THREE }; });
  check('스프라이트 캐릭터(사용자 시트 PNG) 로드', cs.ready && cs.n >= 37 && cs.loaded, 'frames=' + cs.n);
  check('Three.js(3D) 미로드 — 스프라이트가 기본', !cs.three);
  // 프레임 선택: 방향·상태별로 시트의 올바른 프레임을 고르는지(그림 함수 직접 호출, 결정적)
  const picks = await page.evaluate(() => { const P = p => PD.characterSprite.pick(Object.assign({ state: 'idle', t: 0, facing: 1, face: { x: 1, y: 0 }, walkPhase: 0, walkBlend: 1 }, p));
    return { up: P({ face: { x: 0, y: -1 } }), down: P({ face: { x: 0, y: 1 } }), left: P({ face: { x: -1, y: 0 } }), dl: P({ face: { x: -0.707, y: 0.707 } }), ur: P({ face: { x: 0.707, y: -0.707 } }),
      walkR: P({ state: 'walk', walkPhase: Math.PI * 0.6 }), walkR2: P({ state: 'walk', walkPhase: Math.PI * 1.4 }), walkL: P({ state: 'walk', face: { x: -1, y: 0 }, walkPhase: Math.PI * 0.6 }), walkUp: P({ state: 'walk', face: { x: 0, y: -1 } }),
      squatA: P({ state: 'squat', t: 0.2 }), squatB: P({ state: 'squat', t: 0.8 }), strain: P({ state: 'strain' }), poopA: P({ state: 'poop', t: 0.2 }), poopB: P({ state: 'poop', t: 0.8 }), riseA: P({ state: 'rise', t: 0.3 }), riseB: P({ state: 'rise', t: 0.9 }), squatL: P({ state: 'squat', t: 0.2, facing: -1 }) }; });
  check('프레임 선택: idle 방향별(정면/후면/왼쪽/아래대각선, 위대각선→후면)', picks.up.id === 'idle_back' && picks.down.id === 'idle_front' && picks.left.id === 'idle_left' && picks.dl.id === 'idle_diag_left' && picks.ur.id === 'idle_back', [picks.up.id, picks.down.id, picks.left.id, picks.dl.id, picks.ur.id].join(','));
  check('프레임 선택: 걷기(오른쪽 walk_NN 위상별 다른 프레임, 왼쪽은 반전, 위는 후면 부위 조각)', /^walk_\d\d$/.test(picks.walkR.id) && !picks.walkR.flip && picks.walkR.id !== picks.walkR2.id && /^walk_\d\d$/.test(picks.walkL.id) && picks.walkL.flip && picks.walkUp.id === 'idle_back' && picks.walkUp.parts === true, picks.walkR.id + '/' + picks.walkR2.id + '/' + picks.walkL.id);
  check('프레임 선택: 배변 순서(준비1→준비2→싸기1→싸기2→싸기3→일어남1→일어남2, 왼쪽은 반전)', picks.squatA.id === 'poop_ready1' && picks.squatB.id === 'poop_ready2' && picks.strain.id === 'poop_do1' && picks.poopA.id === 'poop_do2' && picks.poopB.id === 'poop_do3' && picks.riseA.id === 'poop_rise1' && picks.riseB.id === 'poop_rise2' && picks.squatL.flip === true);
  // 정면·후면 걷기: 부위 조각(다리 2·팔 2·몸통)이 있고, 두 다리가 번갈아 들리며 팔은 반대 위상
  const fw = await page.evaluate(() => {
    const S = PD.characterSprite; const f = S.frames.idle_front, b = S.frames.idle_back;
    const partsOk = ['legL', 'legR', 'armL', 'armR', 'body'].every(k => f.parts && f.parts[k] && f.parts[k].img && f.parts[k].img.naturalWidth > 0 && b.parts && b.parts[k] && b.parts[k].img);
    const pk = S.pick({ state: 'walk', face: { x: 0, y: 1 }, walkPhase: 1, walkBlend: 1, moving: true });
    const pkB = S.pick({ state: 'walk', face: { x: 0, y: -1 }, walkPhase: 1, walkBlend: 1, moving: true });
    const w1 = S.walkParts({ walkPhase: Math.PI / 2, walkBlend: 1 }, 100), w2 = S.walkParts({ walkPhase: 1.5 * Math.PI, walkBlend: 1 }, 100), w0 = S.walkParts({ walkPhase: 0.3, walkBlend: 0 }, 100);
    return { partsOk, front: pk.id === 'idle_front' && pk.parts === true, back: pkB.id === 'idle_back' && pkB.parts === true, w1, w2, w0 };
  });
  check('정면·후면 걷기: 부위 조각 로드(다리2·팔2·몸통) + 걷기 시 조각 모드', fw.partsOk && fw.front && fw.back);
  check('정면 걷기: 두 다리가 번갈아 들림(한쪽만 >0) · 팔은 반대 위상 · 멈추면 0', fw.w1.liftL > 3 && fw.w1.liftR === 0 && fw.w2.liftR > 3 && fw.w2.liftL === 0 && Math.sign(fw.w1.armL) === -Math.sign(fw.w1.armR) && fw.w0.liftL === 0 && fw.w0.liftR === 0 && fw.w0.bob === 0,
    'π/2: L=' + fw.w1.liftL.toFixed(1) + ' R=' + fw.w1.liftR.toFixed(1) + ' · 3π/2: L=' + fw.w2.liftL.toFixed(1) + ' R=' + fw.w2.liftR.toFixed(1) + ' · armL=' + fw.w1.armL.toFixed(2));
  const icons = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img.poop-icon'));
    const noEmoji = !/💩/.test(document.getElementById('hud').textContent + document.querySelector('.poop-btn-label').textContent + document.querySelector('.result-stats').textContent);
    return { n: imgs.length, loaded: imgs.every(i => i.complete && i.naturalWidth > 0), noEmoji, hudW: imgs[0] ? imgs[0].getBoundingClientRect().width : 0 };
  });
  check('글자 속 똥 아이콘(HUD·버튼·결과) = 1번 PNG, 이모지 없음', icons.n >= 3 && icons.loaded && icons.noEmoji, 'icons=' + icons.n + ' w=' + icons.hudW.toFixed(0) + 'px');
  check('똥 그림은 poop_1 만 사용(2·3 제거)', spr.ids.length === 1 && spr.ids[0] === 'poop_1' && spr.c[0] === 3000, spr.ids.join(',') + ' ' + spr.c.join('/'));
  check('기준 똥 스프라이트 크기(배율 1.1×dpr2)', spr.spW >= 38 && spr.spW <= 48 && spr.spH < spr.spW, spr.spW + '×' + spr.spH);

  // ---- 이동: 탭 / 길게 / 정지 보간 / 걸음 위상 ----
  let b = await snap(page);
  await page.keyboard.down('ArrowRight'); await sleep(15); await page.keyboard.up('ArrowRight'); await sleep(45);
  s = await snap(page);
  const tapDx = s.x - b.x;
  check('짧은 탭(15ms) → 한 걸음', tapDx >= CFG.TAP_STEP - 0.5 && tapDx <= CFG.TAP_STEP + 4, 'dx=' + tapDx.toFixed(1) + ' (step ' + CFG.TAP_STEP + ')');
  const wantPhase = tapDx / CFG.WALK_STRIDE * Math.PI;
  check('탭 한 걸음 → 다리가 이동 거리만큼 한 걸음 내딛는 중(시각)', s.walkPhase > wantPhase * 0.5 && s.walkPhase < wantPhase * 1.6 + 0.3 && s.walkBlend > 0, 'phase=' + s.walkPhase.toFixed(2) + ' (거리 기준 ' + wantPhase.toFixed(2) + ') blend=' + s.walkBlend.toFixed(2));
  await sleep(450);
  s = await snap(page);
  check('정지 후 걷기 블렌드 0 · 위상 리셋', s.walkBlend === 0 && s.walkPhase === 0, 'blend=' + s.walkBlend + ' phase=' + s.walkPhase);
  b = await snap(page);
  await hold(page, 'KeyW', 15);
  s = await snap(page);
  check('WASD 탭(W) → 위로 한 걸음', near(b.y - s.y, CFG.TAP_STEP, 4) && s.x === b.x, 'dy=' + (b.y - s.y).toFixed(1));
  check('위로 움직이면 후면(up)', s.dir === 'up', s.dir);

  const expectHold = CFG.TAP_STEP + CFG.MOVEMENT_SPEED * (CFG.HOLD_DELAY_MS * CFG.SLOW_FACTOR + CFG.HOLD_RAMP_MS * (CFG.SLOW_FACTOR + 1) / 2 + (500 - CFG.HOLD_DELAY_MS - CFG.HOLD_RAMP_MS)) / 1000;
  await sleep(300);
  await recenter(page);
  b = await snap(page);
  await page.keyboard.down('ArrowRight'); await sleep(500);
  const during = await snap(page);
  await page.keyboard.up('ArrowRight'); await sleep(30);
  const justAfter = await snap(page);
  await sleep(120);
  const midAfter = await snap(page);
  await sleep(200);
  s = await snap(page);
  const holdDx = s.x - b.x;
  check('길게 누름 0.5초 → 연속 이동', near(holdDx, expectHold, 14), 'dx=' + holdDx.toFixed(1) + ' (예상 ' + expectHold.toFixed(1) + ')');
  check('떼면 좌표 즉시 정지', justAfter.x === s.x);
  check('걷는 동안 블렌드 1 · 위상 진행 · 오른쪽 옆모습', during.walkBlend === 1 && during.walkPhase > 2 && during.dir === 'right' && during.poseState === 'walk', 'blend=' + during.walkBlend + ' phase=' + during.walkPhase.toFixed(2));
  const steps = (during.walkPhase - 0) / Math.PI, dist = during.x - b.x;
  check('걸음 수가 이동 거리와 맞음(미끄러짐 없음, 상한 ' + CFG.WALK_MAX_STEP_HZ + '걸음/s)', steps <= Math.min(dist / CFG.WALK_STRIDE, CFG.WALK_MAX_STEP_HZ * 0.5) + 0.6 && steps >= Math.min(dist / CFG.WALK_STRIDE, CFG.WALK_MAX_STEP_HZ * 0.5) * 0.6, '걸음 ' + steps.toFixed(1) + ' · 거리 ' + dist.toFixed(0) + ' (거리/보폭 ' + (dist / CFG.WALK_STRIDE).toFixed(1) + ')');
  check('정지 직후 다리가 바로 끊기지 않고 보간 중(걸음 마무리 → 기본 자세로)', justAfter.walkBlend > 0 && midAfter.walkBlend > 0 && midAfter.walkBlend < 1, 'blend@30ms=' + justAfter.walkBlend.toFixed(2) + ' @150ms=' + midAfter.walkBlend.toFixed(2));
  check('정지 0.35초 후 기본 자세', s.walkBlend === 0 && s.walkPhase === 0 && s.poseState === 'idle');
  b = await snap(page);
  await hold(page, 'KeyD', 300);
  s = await snap(page);
  check('WASD 길게(D) 연속 이동', s.x - b.x > 15, 'dx=' + (s.x - b.x).toFixed(1));

  // ---- 8방향 face · 4방향 dir · 회전 보간 ----
  await hold(page, 'ArrowDown', 120);
  s = await snap(page);
  check('아래로 움직이면 정면(down)', s.dir === 'down' && near(s.face.y, 1, 0.001), s.dir);
  await hold(page, 'ArrowLeft', 120);
  s = await snap(page);
  check('왼쪽으로 움직이면 왼쪽 옆모습', s.dir === 'left' && s.facing === -1 && near(s.face.x, -1, 0.001), s.dir);
  await hold(page, 'ArrowRight', 120);
  await page.keyboard.down('ArrowRight'); await page.keyboard.down('ArrowUp'); await sleep(150);
  const diag1 = await snap(page);
  await page.keyboard.up('ArrowRight'); await sleep(120);
  const upOnly = await snap(page);
  await page.keyboard.up('ArrowUp'); await sleep(60);
  check('대각선(→+↑): face 가 정확히 45° · 4방향은 가로(right)', near(diag1.face.x, Math.SQRT1_2, 0.01) && near(diag1.face.y, -Math.SQRT1_2, 0.01) && diag1.dir === 'right', 'face=(' + diag1.face.x.toFixed(2) + ',' + diag1.face.y.toFixed(2) + ') dir=' + diag1.dir);
  check('→ 떼고 ↑만(120ms 유지): 후면으로 전환', upOnly.dir === 'up' && near(upOnly.face.y, -1, 0.001), upOnly.dir);
  // 대각선에서 두 키를 순서대로 떼면(사람 손) 마지막 한 축이 유예 시간보다 짧게 남으므로 대각선 방향이 유지된다
  await holdMany(page, ['ArrowRight', 'ArrowDown'], 200);
  const afterRelease = await snap(page);
  check('대각선 걷다 멈춤: 키를 순서대로 떼도 45° 방향 유지(움찔 없음)', near(afterRelease.face.x, Math.SQRT1_2, 0.01) && near(afterRelease.face.y, Math.SQRT1_2, 0.01), 'face=(' + afterRelease.face.x.toFixed(2) + ',' + afterRelease.face.y.toFixed(2) + ')');
  // 걷는 동안 시트 프레임이 실제로 바뀌는지(이동 거리 기반 위상 → 프레임 번호)
  await recenter(page);
  await hold(page, 'ArrowUp', 150); await sleep(300);
  await page.keyboard.down('ArrowRight');
  const fr = [];
  for (let i = 0; i < 6; i++) { await sleep(60); fr.push(await page.evaluate(() => PD.characterSprite.pick(PD_DEBUG.world.snapshot().pose).id)); }
  await page.keyboard.up('ArrowRight'); await sleep(300);
  const idleAfter = await page.evaluate(() => PD.characterSprite.pick(PD_DEBUG.world.snapshot().pose).id);
  check('걷는 동안 걷기 프레임이 순환하고 멈추면 서 있는 프레임', fr.every(f => /^walk_\d\d$/.test(f)) && new Set(fr).size >= 3 && idleAfter === 'idle_right', fr.join(',') + ' → ' + idleAfter);
  // 대각선 속도: 정지 상태에서 두 키를 동시에 300ms → 두 축 이동량이 같고, 합성 속도는 한 축 단독보다 빠르지 않다
  await sleep(200);
  await recenter(page);
  const d0 = await snap(page);
  await holdMany(page, ['ArrowRight', 'ArrowDown'], 300);
  const d1 = await snap(page);
  const dgx = d1.x - d0.x, dgy = d1.y - d0.y, dgLen = Math.hypot(dgx, dgy);
  const d2 = await snap(page);
  await holdMany(page, ['ArrowRight'], 300);
  const d3 = await snap(page);
  const straight = d3.x - d2.x;
  check('대각선 속도 정규화(두 축 같은 이동량 · 합성 거리 ≈ 한 축 단독)', near(dgx, dgy, 4) && dgLen <= straight * 1.2 && dgLen >= straight * 0.8, 'dx=' + dgx.toFixed(1) + ' dy=' + dgy.toFixed(1) + ' 합성=' + dgLen.toFixed(1) + ' · 단독=' + straight.toFixed(1));
  // 안내 문구는 첫 똥 전까지(이동·시간 경과와 무관하게) 계속 보이고, 캐릭터를 따라다닌다
  {
    const hv = await page.evaluate(() => { const s = PD_DEBUG.world.snapshot(), cam = PD.camera.get(), app = document.getElementById('app').getBoundingClientRect(); const h = document.getElementById('hint').getBoundingClientRect(); const charX = app.width / 2 + (s.x - cam.x) * cam.scale; return { show: document.getElementById('hint').classList.contains('show'), n: s.poops.length, offX: (h.left + h.right) / 2 - app.left - app.width / 2, offY: h.top - app.top - app.height / 2, charDx: charX - app.width / 2 }; });
    check('안내 문구: 첫 똥 전엔 이동 뒤에도 계속 표시 · 위치 고정(화면 중앙 아래 44px, 캐릭터를 따라가지 않음)', hv.show && hv.n === 0 && Math.abs(hv.offX) < 2 && Math.abs(hv.offY - 44) < 2 && Math.abs(hv.charDx) > 20, 'n=' + hv.n + ' off=' + hv.offX.toFixed(1) + ',' + hv.offY.toFixed(1) + ' charDx=' + hv.charDx.toFixed(0));
  }

  // ---- SPACE 1회 → 6단계 타이밍 (오른쪽을 보고) ----
  await recenter(page);
  await hold(page, 'ArrowRight', 200); await sleep(200);
  b = await snap(page);
  const t0 = Date.now();
  await page.keyboard.press('Space');
  const at = async ms => { const w = ms - (Date.now() - t0); if (w > 0) await sleep(w); return snap(page); };
  let mid = await at(CFG.STOP_MS * 0.5);
  check('입력 직후 stop(걸음 멈춤) 단계', mid.action === 'stop' && mid.poseState === 'stop', mid.action);
  mid = await at(CFG.STOP_MS + CFG.SQUAT_MS * 0.5);
  check('squat: 앉는 중 · 똥 없음', mid.action === 'squat' && mid.crouch > 0.15 && mid.crouch < 0.95 && mid.n === b.n, mid.action + ' crouch=' + mid.crouch.toFixed(2));
  await hold(page, 'ArrowRight', 60); // 모션 중 이동 입력
  mid = await snap(page);
  check('모션 중 이동·방향 잠금', near(mid.x, b.x, 0.001) && mid.dir === 'right');
  mid = await at(CFG.STOP_MS + CFG.SQUAT_MS + CFG.STRAIN_MS * 0.25);
  check('strain: 완전히 앉은 채 힘주기(꿈틀) · 아직 똥 없음', mid.action === 'strain' && mid.crouch === 1 && mid.push > 0.3 && mid.n === b.n, mid.action + ' push=' + mid.push.toFixed(2));
  mid = await at(CFG.STOP_MS + CFG.SQUAT_MS + CFG.STRAIN_MS + CFG.POOP_EMERGE_MS * 0.5);
  check('poop: 똥이 엉덩이 아래에서 나오는 중(작게, 바닥 위)', mid.action === 'poop' && mid.n === b.n + 1 && mid.anim && mid.anim.phase === 'emerge' && mid.anim.sx < 0.95 && mid.anim.y < mid.y, (mid.anim ? mid.anim.phase + ' scale=' + mid.anim.sx.toFixed(2) + ' y-off=' + (mid.anim.y - mid.y).toFixed(1) : 'no anim'));
  mid = await at(CFG.STOP_MS + CFG.SQUAT_MS + CFG.STRAIN_MS + CFG.POOP_EMERGE_MS + CFG.POOP_FALL_MS * 0.5);
  const lastGround = mid.poops[mid.poops.length - 1];
  check('poop: 낙하 중(spawn 과 ground 사이) · 캐릭터는 앉은 채', mid.action === 'poop' && mid.crouch === 1 && mid.anim.phase === 'fall' && mid.anim.y > lastGround.sy && mid.anim.y < lastGround.y, mid.anim.phase + ' y=' + mid.anim.y.toFixed(1) + ' (spawn ' + lastGround.sy.toFixed(1) + ' → ground ' + lastGround.y.toFixed(1) + ')');
  mid = await at(CFG.STOP_MS + CFG.SQUAT_MS + CFG.STRAIN_MS + CFG.POOP_EMERGE_MS + CFG.POOP_FALL_MS + CFG.POOP_LAND_MS * 0.5);
  check('착지 squash(가로 ↑ 세로 ↓) + rise 시작', mid.action === 'rise' && mid.anim.phase === 'land' && mid.anim.sx > 1 && mid.anim.sy < 1, mid.anim.phase + ' sx=' + mid.anim.sx.toFixed(2) + ' sy=' + mid.anim.sy.toFixed(2));
  await sleep(cycleMs);
  s = await snap(page);
  check('모션 종료 후 idle · 똥은 최종 위치에 고정', s.action === 'idle' && s.crouch === 0 && s.anim.phase === 'rest' && s.anim.x === lastGround.x && s.anim.y === lastGround.y, s.action);
  check('똥 정확히 1개', s.n === b.n + 1 && s.stats.poops === 1);
  const p = s.poops[s.poops.length - 1];
  check('똥에 그림 종류(v) 기록', Number.isInteger(p.v) && p.v >= 0 && p.v < 3, 'v=' + p.v);
  const g = groundOf(CFG, s, 1, 0), sp0 = offsetsOf(CFG, 1, 0).spawn;
  check('똥 최종 위치 = 오른쪽 볼 때 엉덩이 뒤(왼쪽)', near(p.x, g.x, 0.01) && near(p.y, g.y, 0.01), 'dx=' + (p.x - s.x).toFixed(1) + ' dy=' + (p.y - s.y).toFixed(1));
  check('똥 나오는 지점 = 엉덩이 아래(바닥 위) · 낙하 거리 > 8', near(p.sx - s.x, sp0.x, 0.01) && near(p.sy - s.y, sp0.y, 0.01) && (p.y - p.sy) > 8, '낙하 거리=' + (p.y - p.sy).toFixed(1));
  check('첫 똥 후 안내 사라짐', !(await page.$eval('#hint', el => el.classList.contains('show'))));
  b = await snap(page);
  await hold(page, 'ArrowRight', 200);
  s = await snap(page);
  check('일어난 직후 바로 이동 가능', s.x - b.x > 10, 'dx=' + (s.x - b.x).toFixed(1));

  check('안내 문구: 첫 똥 뒤 사라짐', !(await page.$eval('#hint', el => el.classList.contains('show'))) && (await snap(page)).n >= 1);

  // SPACE 30연타 → 한 사이클에 1개만
  b = await snap(page);
  for (let i = 0; i < 30; i++) { await page.keyboard.press('Space'); }
  await sleep(cycleMs + 400);
  s = await snap(page);
  check('SPACE 30연타 → 추가 1개만', s.n === b.n + 1 && s.stats.poops === b.stats.poops + 1, 'n=' + s.n);

  // ---- 8방향 이동 후 배변 → 방향별 엉덩이 위치, 가림 순서 ----
  // 8방향: face 는 입력 벡터 그대로(대각선 45°), dir 은 가장 가까운 4방향(같으면 가로). 똥 위치는 face 로 계산
  const R = Math.SQRT1_2;
  const dirs = [
    { name: '→', keys: ['ArrowRight'], f: [1, 0], dir: 'right' }, { name: '↘', keys: ['ArrowRight', 'ArrowDown'], f: [R, R], dir: 'right' },
    { name: '↓', keys: ['ArrowDown'], f: [0, 1], dir: 'down' }, { name: '↙', keys: ['ArrowDown', 'ArrowLeft'], f: [-R, R], dir: 'left' },
    { name: '←', keys: ['ArrowLeft'], f: [-1, 0], dir: 'left' }, { name: '↖', keys: ['ArrowLeft', 'ArrowUp'], f: [-R, -R], dir: 'left' },
    { name: '↑', keys: ['ArrowUp'], f: [0, -1], dir: 'up' }, { name: '↗', keys: ['ArrowUp', 'ArrowRight'], f: [R, -R], dir: 'right' },
  ];
  // 배변 프레임이 옆모습뿐이라 배변은 항상 마지막 가로 방향으로 돌아서 하고, 똥은 그 옆 기준(엉덩이 뒤)에 놓인다. 일어나면 정면(시트의 일어남2)
  let dirOk = true, dirDetail = [], sideOk = true, side = 1;
  await recenter(page);
  for (const d of dirs) {
    await holdMany(page, d.keys, 160);
    const before = await snap(page);
    if (d.f[0] > 0) side = 1; else if (d.f[0] < 0) side = -1;
    await poopAndWait(page, CFG);
    s = await snap(page);
    const q = s.poops[s.poops.length - 1];
    const gg = groundOf(CFG, s, side, 0);
    const faceOk = before.dir === d.dir && near(before.face.x, d.f[0], 0.01) && near(before.face.y, d.f[1], 0.01);
    const ok = faceOk && near(q.x, gg.x, 0.01) && near(q.y, gg.y, 0.01) && q.f === true && s.dir === 'down' && near(s.face.y, 1, 0.001);
    if (!ok) dirOk = false;
    if (!(q.y > s.y && q.f === true)) sideOk = false;
    dirDetail.push(d.name + (ok ? '✓' : '✗(' + before.dir + '→' + s.dir + ')'));
  }
  check('8방향 이동 후 face·dir, 배변은 옆(마지막 가로 방향)으로 돌아서 → 똥은 엉덩이 뒤 → 일어나면 정면', dirOk, dirDetail.join(' '));
  check('똥은 항상 발 기준선 앞(캐릭터 앞에 그려짐)', sideOk);
  await page.screenshot({ path: path.join(SHOT, 'qa-02a-play-dirs-390.png') });

  // 촘촘한 직선: 탭 1번 + 배변 반복 → 똥 간격이 똥 폭보다 작다
  await recenter(page);
  await holdMany(page, ['ArrowRight'], 400);
  await sleep(60);
  const lineStart = (await snap(page)).n;
  for (let i = 0; i < 6; i++) { await hold(page, 'ArrowRight', 15); await poopAndWait(page, CFG); }
  const line = await page.evaluate(n0 => PD_DEBUG.world.snapshot().poops.slice(n0).map(p => ({ x: p.x, y: p.y })), lineStart);
  const gaps = line.slice(1).map((q, i) => q.x - line[i].x);
  check('탭+배변 반복 → 촘촘한 직선', gaps.length === 5 && gaps.every(gp => gp > 3 && gp < CFG.POOP_SIZE) && line.every(q => q.y === line[0].y), 'gaps=' + gaps.map(gp => gp.toFixed(1)).join(','));

  // 되돌리기: 개수 -1, 통계는 유지
  b = await snap(page);
  await page.tap('#btn-undo'); await sleep(60);
  s = await snap(page);
  check('되돌리기 → 남은 똥 -1, 총 횟수 유지', s.n === b.n - 1 && s.stats.poops === b.stats.poops, 'n=' + s.n + ' total=' + s.stats.poops);
  await page.keyboard.press('Control+KeyZ'); await sleep(60);
  s = await snap(page);
  check('Ctrl+Z 되돌리기', s.n === b.n - 2);

  // ---- 마우스 클릭 이동(PC): 클릭한 지점으로 걸어가 멈춤 · 키 입력이 있으면 취소 · 배변 중 클릭은 일어난 뒤 이동 · 영역 밖은 경계에서 정지 · 터치 탭은 무시 ----
  await recenter(page);
  const cwToScreen = (ox, oy) => page.evaluate(([ox, oy]) => { const s = PD_DEBUG.world.snapshot(), cam = PD.camera.get(), app = document.getElementById('app').getBoundingClientRect(); return { x: app.left + app.width / 2 + (s.x - cam.x) * cam.scale + ox, y: app.top + app.height / 2 + (s.y - cam.y) * cam.scale + oy, wx: s.x + ox / cam.scale, wy: s.y + oy / cam.scale }; }, [ox, oy]);
  const cwTargetOf = () => page.evaluate(() => PD_DEBUG.world.snapshot().target);
  let cwTgt = await cwToScreen(80, 40);
  await page.mouse.click(cwTgt.x, cwTgt.y);
  await sleep(160);
  const cwMid = await snap(page), cwMidTarget = await cwTargetOf();
  check('클릭 이동: 클릭 직후 목표 설정 · 걷는 중(walk) · 오른쪽을 봄', !!cwMidTarget && near(cwMidTarget.x, cwTgt.wx, 0.5) && near(cwMidTarget.y, cwTgt.wy, 0.5) && cwMid.poseState === 'walk' && cwMid.dir === 'right', 'state=' + cwMid.poseState + ' dir=' + cwMid.dir);
  await sleep(1200);
  s = await snap(page);
  check('클릭 이동: 목표 지점에 도착해 멈춤(오차 < 0.5유닛) · 목표 해제 · idle', near(s.x, cwTgt.wx, 0.5) && near(s.y, cwTgt.wy, 0.5) && !(await cwTargetOf()) && s.poseState === 'idle', 'pos=' + s.x.toFixed(1) + ',' + s.y.toFixed(1) + ' target=' + cwTgt.wx.toFixed(1) + ',' + cwTgt.wy.toFixed(1));
  cwTgt = await cwToScreen(-120, 0);
  await page.mouse.click(cwTgt.x, cwTgt.y); await sleep(120);
  await hold(page, 'ArrowDown', 120); await sleep(250);
  const cwAfterKey = await snap(page); await sleep(300); const cwAfterKey2 = await snap(page);
  check('클릭 이동: 방향키를 누르면 목표 취소 · 떼면 그 자리에 정지', !(await cwTargetOf()) && near(cwAfterKey.x, cwAfterKey2.x, 0.01) && near(cwAfterKey.y, cwAfterKey2.y, 0.01) && !near(cwAfterKey.x, cwTgt.wx, 2), 'x=' + cwAfterKey.x.toFixed(1) + ' target=' + cwTgt.wx.toFixed(1));
  await recenter(page);
  const cwP0 = await snap(page);
  await page.keyboard.press('Space'); await sleep(100);
  cwTgt = await cwToScreen(0, 60);
  await page.mouse.click(cwTgt.x, cwTgt.y); await sleep(300);
  const cwDuring = await snap(page);
  check('클릭 이동: 배변 중 클릭은 움직이지 않음(목표만 기억)', cwDuring.action !== 'idle' && near(cwDuring.x, cwP0.x, 0.01) && near(cwDuring.y, cwP0.y, 0.01) && !!(await cwTargetOf()), 'action=' + cwDuring.action);
  await sleep(cycleMs + 1200);
  s = await snap(page);
  check('클릭 이동: 일어난 뒤 목표 지점으로 이동', near(s.x, cwTgt.wx, 0.5) && near(s.y, cwTgt.wy, 0.5) && s.n === cwP0.n + 1, 'pos=' + s.x.toFixed(1) + ',' + s.y.toFixed(1) + ' target=' + cwTgt.wx.toFixed(1) + ',' + cwTgt.wy.toFixed(1));
  await recenter(page);
  const cwArea = await page.evaluate(() => PD_DEBUG.world.getArea());
  const cwApp = await page.evaluate(() => { const r = document.getElementById('app').getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width }; });
  await page.mouse.click(cwApp.l + cwApp.w / 2, cwApp.t + 70); await sleep(2600);
  s = await snap(page);
  check('클릭 이동: 영역 밖(HUD 근처) 클릭 → 영역 위쪽 경계에서 정지 · 목표 해제', near(s.y, cwArea.minY, 0.5) && !(await cwTargetOf()), 'y=' + s.y.toFixed(1) + ' minY=' + cwArea.minY.toFixed(1));
  await recenter(page);
  const cwPt = await snap(page);
  const cwTp = await cwToScreen(100, 0);
  const cdp0 = await ctx.newCDPSession(page);
  await cdp0.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cwTp.x, y: cwTp.y }] });
  await cdp0.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(400);
  const afterTap = await snap(page);
  check('클릭 이동: 터치 탭은 이동하지 않음(터치는 D-pad 전용)', near(afterTap.x, cwPt.x, 0.01) && near(afterTap.y, cwPt.y, 0.01) && !(await cwTargetOf()), 'x=' + afterTap.x.toFixed(1));
  await cdp0.detach();

  // ---- 터치 D-pad / 💩 버튼 ----
  await recenter(page);
  const cdp = await ctx.newCDPSession(page);
  const center = sel => page.$eval(sel, el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; });
  const rb = await center('.dpad-btn[data-dir="right"]');
  check('D-pad 화살표 터치 영역 ≥ 52', rb.w >= 52 && rb.h >= 52, rb.w.toFixed(0) + '×' + rb.h.toFixed(0));
  const expectTouch = CFG.TAP_STEP + CFG.MOVEMENT_SPEED * (CFG.HOLD_DELAY_MS * CFG.SLOW_FACTOR + CFG.HOLD_RAMP_MS * (CFG.SLOW_FACTOR + 1) / 2 + (300 - CFG.HOLD_DELAY_MS - CFG.HOLD_RAMP_MS)) / 1000;
  const b0 = await snap(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rb.x, y: rb.y }] });
  await sleep(300);
  const onCls = await page.$eval('.dpad-btn[data-dir="right"]', el => el.classList.contains('on'));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(50);
  s = await snap(page);
  check('터치 D-pad ▶ 300ms 이동', near(s.x - b0.x, expectTouch, 12), 'dx=' + (s.x - b0.x).toFixed(1) + ' (예상 ' + expectTouch.toFixed(1) + ') on=' + onCls);
  const bt = await snap(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rb.x, y: rb.y }] });
  await sleep(20);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(50);
  s = await snap(page);
  check('터치 D-pad 짧은 탭 → 한 걸음', near(s.x - bt.x, CFG.TAP_STEP, 4), 'dx=' + (s.x - bt.x).toFixed(1));
  const upb = await center('.dpad-btn[data-dir="up"]');
  const b1 = await snap(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rb.x, y: rb.y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rb.x, y: rb.y, id: 1 }, { x: upb.x, y: upb.y, id: 2 }] });
  await sleep(300);
  const diagTouch = await snap(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(50);
  s = await snap(page);
  check('멀티터치 ▶+▲ 대각선 이동 · 방향은 ▶ 유지', s.x > b1.x + 12 && s.y < b1.y - 12 && diagTouch.dir === 'right', 'dx=' + (s.x - b1.x).toFixed(1) + ' dy=' + (s.y - b1.y).toFixed(1) + ' dir=' + diagTouch.dir);

  const pb = await center('#btn-poop');
  check('💩 버튼 터치 영역 ≥ 140×76', pb.w >= 140 && pb.h >= 76, pb.w.toFixed(0) + '×' + pb.h.toFixed(0));
  const n0 = (await snap(page)).n;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pb.x, y: pb.y }] });
  await sleep(1500);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(100);
  s = await snap(page);
  check('💩 버튼 길게 누름 → 1개만', s.n === n0 + 1, 'n=' + s.n);
  const n1 = (await snap(page)).n;
  const tap0 = Date.now();
  for (let i = 0; i < 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pb.x, y: pb.y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(10);
  }
  const tapSpan = Date.now() - tap0;
  await sleep(cycleMs + 300);
  s = await snap(page);
  const maxAllowed = 1 + Math.floor(tapSpan / cycleMs);
  check('💩 버튼 연타 8회 → 사이클당 1개만', s.n - n1 >= 1 && s.n - n1 <= maxAllowed, '추가=' + (s.n - n1) + ' 연타 소요=' + tapSpan + 'ms 허용 최대=' + maxAllowed);

  // ---- 고정 카메라 · 이동 경계 · 똥 화면 좌표 고정 · 리사이즈 ----
  const camPos = () => page.evaluate(() => { const c = PD_DEBUG.camera.get(); return { x: c.x, y: c.y, scale: c.scale }; });
  const screenOf = () => page.evaluate(() => { const c = PD_DEBUG.camera.get(), w = PD_DEBUG.world.snapshot(); return { sx: (w.x - c.x) * c.scale + PD_DEBUG.viewW / 2, sy: (w.y - c.y) * c.scale + PD_DEBUG.viewH / 2, scale: c.scale }; });
  const cam0 = await camPos();
  const area = await page.evaluate(() => PD_DEBUG.world.getArea());
  check('이동 가능 영역이 화면에서 계산됨', area && area.maxX > area.minX + 100 && area.maxY > area.minY + 100, JSON.stringify(area && { w: Math.round(area.maxX - area.minX), h: Math.round(area.maxY - area.minY) }));
  // 오른쪽 끝까지
  await page.keyboard.down('ArrowRight'); await sleep(2600); await page.keyboard.up('ArrowRight'); await sleep(60);
  s = await snap(page);
  let scr = await screenOf();
  const camA = await camPos();
  check('오른쪽 끝: 영역 경계에서 멈춤 · 캐릭터가 화면 안', near(s.x, area.maxX, 0.01) && scr.sx <= 390 - CFG.AREA_SIDE_INSET * scr.scale + 0.5 && scr.sx > 300, 'x=' + s.x.toFixed(1) + ' screenX=' + scr.sx.toFixed(0));
  check('카메라 고정: 끝까지 걸어도 카메라 x·y·배율 불변', camA.x === cam0.x && camA.y === cam0.y && camA.scale === cam0.scale, JSON.stringify(camA));
  // 경계에서 배변 → 똥이 화면 안
  await poopAndWait(page, CFG);
  s = await snap(page);
  const qe = s.poops[s.poops.length - 1];
  const qeScreen = (qe.x - camA.x) * camA.scale + 195;
  check('경계에서도 배변 가능 · 똥이 화면 안', s.n > 0 && qeScreen >= CFG.POOP_SIZE / 2 * camA.scale && qeScreen <= 390 - CFG.POOP_SIZE / 2 * camA.scale, 'poop screenX=' + qeScreen.toFixed(0));
  // 경계에서 다른 축은 즉시 이동(반동 없음)
  const bEdge = await snap(page);
  await page.keyboard.down('ArrowRight'); await page.keyboard.down('ArrowUp'); await sleep(250); await page.keyboard.up('ArrowUp'); await page.keyboard.up('ArrowRight'); await sleep(60);
  s = await snap(page);
  check('경계에서 막힌 축은 그대로, 다른 축은 즉시 이동', near(s.x, bEdge.x, 0.01) && s.y < bEdge.y - 10, 'dy=' + (s.y - bEdge.y).toFixed(1));
  // 위쪽 끝: 머리가 HUD 아래
  await page.keyboard.down('ArrowUp'); await sleep(4000); await page.keyboard.up('ArrowUp'); await sleep(60);
  s = await snap(page); scr = await screenOf();
  const hudBottom = await page.evaluate(() => document.getElementById('hud').getBoundingClientRect().bottom - document.getElementById('app').getBoundingClientRect().top);
  const headTop = scr.sy - CFG.CHARACTER_HEIGHT * 1.05 * scr.scale;
  check('위쪽 끝: 머리 꼭대기가 HUD 아래', near(s.y, area.minY, 0.01) && headTop >= hudBottom - 0.5, 'headTop=' + headTop.toFixed(0) + ' hudBottom=' + hudBottom.toFixed(0));
  // 아래쪽 끝: 발이 조작 영역 위
  await page.keyboard.down('ArrowDown'); await sleep(5500); await page.keyboard.up('ArrowDown'); await sleep(60);
  s = await snap(page); scr = await screenOf();
  const ctrlTop = await page.evaluate(() => { const a = document.getElementById('app').getBoundingClientRect().top; return Math.min(document.getElementById('dpad').getBoundingClientRect().top, document.getElementById('btn-poop').getBoundingClientRect().top) - a; });
  check('아래쪽 끝: 발이 조작 영역 위', near(s.y, area.maxY, 0.01) && scr.sy <= ctrlTop + 0.5, 'feetY=' + scr.sy.toFixed(0) + ' controlsTop=' + ctrlTop.toFixed(0));
  // 똥 화면 좌표 고정: 캐릭터가 움직여도 이미 놓인 똥의 화면 위치는 불변
  const poopScreen = () => page.evaluate(() => { const c = PD_DEBUG.camera.get(), ps = PD_DEBUG.world.snapshot().poops; return ps.slice(0, 5).map(p => [((p.x - c.x) * c.scale + PD_DEBUG.viewW / 2).toFixed(2), ((p.y - c.y) * c.scale + PD_DEBUG.viewH / 2).toFixed(2)].join(',')).join('|'); });
  const ps0 = await poopScreen();
  await page.keyboard.down('ArrowLeft'); await sleep(1500); await page.keyboard.up('ArrowLeft'); await sleep(60);
  const ps1 = await poopScreen();
  check('똥 화면 좌표 고정(캐릭터 이동 후 동일)', ps0 === ps1 && ps0.length > 0, ps0.slice(0, 40));
  // 리사이즈: 똥 데이터·카메라 불변, 캐릭터는 영역 안
  const dataBefore = await page.evaluate(() => JSON.stringify(PD_DEBUG.world.snapshot().poops.map(p => [p.x, p.y])));
  await page.setViewportSize({ width: 320, height: 568 }); await sleep(300);
  const after = await page.evaluate(() => ({ data: JSON.stringify(PD_DEBUG.world.snapshot().poops.map(p => [p.x, p.y])), cam: PD_DEBUG.camera.get(), w: PD_DEBUG.world.snapshot(), area: PD_DEBUG.world.getArea(), vw: PD_DEBUG.viewW, vh: PD_DEBUG.viewH }));
  check('창 크기 변경(390→320): 똥 데이터·카메라 중심 불변 · 캐릭터는 새 영역 안', after.data === dataBefore && after.cam.x === cam0.x && after.cam.y === cam0.y && after.vw === 320 && after.w.x >= after.area.minX - 0.01 && after.w.x <= after.area.maxX + 0.01 && after.w.y >= after.area.minY - 0.01 && after.w.y <= after.area.maxY + 0.01, 'view=' + after.vw + '×' + after.vh);
  await page.setViewportSize({ width: 390, height: 844 }); await sleep(300);
  const back = await page.evaluate(() => JSON.stringify(PD_DEBUG.world.snapshot().poops.map(p => [p.x, p.y])));
  check('창 크기 복귀: 똥 데이터 그대로', back === dataBefore);
  // 중앙 근처로 복귀(이후 테스트의 하트 배치가 화면 안에 들어오게)
  await hold(page, 'ArrowRight', 900); await hold(page, 'ArrowUp', 1200);

  // 하트 배치(조작 경로는 위에서 검증했으므로 world API로)
  await page.evaluate(() => {
    const w = PD_DEBUG.world; const s = w.snapshot();
    const cx = s.x, cy = s.y - 150; const pts = [];
    for (let i = 0; i < 48; i++) { const t = i / 48 * Math.PI * 2; pts.push({ x: cx + 16 * Math.pow(Math.sin(t), 3) * 8, y: cy - (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * 8 }); }
    pts.forEach((p, i) => { s.poops.push({ x: p.x - 14, y: p.y + 5, t: -10, v: i % 6 === 0 ? 1 : (i % 9 === 0 ? 2 : 0) }); s.stats.poops++; });
  });
  await sleep(100);
  await page.screenshot({ path: path.join(SHOT, 'qa-02-play-390.png') });

  // 처음부터 → 확인창 → 취소는 유지
  await page.tap('#btn-reset'); await sleep(100);
  check('처음부터 → 확인창', await page.$eval('#modal', el => el.classList.contains('open')));
  await page.screenshot({ path: path.join(SHOT, 'qa-03-confirm-390.png') });
  await page.tap('#modal-cancel'); await sleep(100);
  s = await snap(page);
  check('취소 → 유지', s.n > 40 && !(await page.$eval('#modal', el => el.classList.contains('open'))));

  // 완성 → RESULT
  await page.tap('#btn-done'); await sleep(100);
  await page.tap('#modal-ok'); await sleep(800);
  s = await snap(page);
  check('완성 → RESULT', s.state === 'result');
  check('RESULT에서 컨트롤·HUD·안내 숨김', await page.evaluate(() => getComputedStyle(document.getElementById('controls')).display === 'none' && getComputedStyle(document.getElementById('hud')).display === 'none' && !document.getElementById('hint').classList.contains('show')));
  const fitInfo = await page.evaluate(() => {
    const cam = PD_DEBUG.camera.get(); const vw = PD_DEBUG.viewW, vh = PD_DEBUG.viewH;
    const mid = document.getElementById('result-middle');
    const rect = { x: mid.offsetLeft, y: mid.offsetTop, w: mid.offsetWidth, h: mid.offsetHeight };
    const ps = PD_DEBUG.world.snapshot().poops; let inside = 0;
    const r = PD.CONFIG.POOP_SIZE / 2 * cam.scale;
    ps.forEach(p => { const sx = (p.x - cam.x) * cam.scale + vw / 2, sy = (p.y - cam.y) * cam.scale + vh / 2;
      if (sx - r >= rect.x && sx + r <= rect.x + rect.w && sy - r >= rect.y && sy + r <= rect.y + rect.h) inside++; });
    const b = PD_DEBUG.world.bounds();
    const bx = ((b.minX + b.maxX) / 2 - cam.x) * cam.scale + vw / 2, by = ((b.minY + b.maxY) / 2 - cam.y) * cam.scale + vh / 2;
    const fillW = (b.maxX - b.minX) * cam.scale / rect.w, fillH = (b.maxY - b.minY) * cam.scale / rect.h;
    return { inside, total: ps.length, scale: cam.scale, rect, centerDx: bx - (rect.x + rect.w / 2), centerDy: by - (rect.y + rect.h / 2), fill: Math.max(fillW, fillH), midRatio: rect.h / vh };
  });
  check('모든 똥이 작품 영역 안', fitInfo.inside === fitInfo.total, fitInfo.inside + '/' + fitInfo.total + ' scale=' + fitInfo.scale.toFixed(2));
  check('작품 중앙 정렬', Math.abs(fitInfo.centerDx) < 1 && Math.abs(fitInfo.centerDy) < 1, 'dx=' + fitInfo.centerDx.toFixed(2) + ' dy=' + fitInfo.centerDy.toFixed(2));
  check('작품이 영역을 크게 채움(제한 변 ≥ 85%)', fitInfo.fill >= 0.85, 'fill=' + (fitInfo.fill * 100).toFixed(0) + '% · 작품 영역 높이 ' + (fitInfo.midRatio * 100).toFixed(0) + '% of 화면');
  const resText = await page.$eval('.result-stats', el => el.innerText);
  check('결과 문구 3줄', /총 \d+번 쌌어요/.test(resText) && /걸렸어요/.test(resText) && /\d+m 걸었어요/.test(resText), resText.replace(/\n/g, ' / '));
  check('결과 화면 fit(스크롤 없음)', await page.evaluate(() => document.getElementById('screen-result').scrollHeight <= document.getElementById('app').clientHeight + 1));
  await page.screenshot({ path: path.join(SHOT, 'qa-04-result-390.png') });

  // 저장 이미지
  const exp = await page.evaluate(() => {
    const c = PD_DEBUG.buildImage(); const ctx = c.getContext('2d');
    const A = PD.CONFIG.EXPORT_ART; const d = ctx.getImageData(A.x, A.y, A.w, A.h).data; let brown = 0;
    let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
    for (let i = 0; i < d.length; i += 4) if (!(d[i] > 240 && d[i + 1] > 240 && d[i + 2] > 240)) { brown++; const px = (i / 4) % A.w, py = Math.floor(i / 4 / A.w); if (px < minX) minX = px; if (px > maxX) maxX = px; if (py < minY) minY = py; if (py > maxY) maxY = py; }
    const edge = ctx.getImageData(0, 0, c.width, 60).data; let top = 0; for (let i = 0; i < edge.length; i += 4) if (edge[i] < 250) top++;
    return { w: c.width, h: c.height, brown, topInk: top, fill: Math.max((maxX - minX) / A.w, (maxY - minY) / A.h) };
  });
  check('저장 이미지 1080×1920', exp.w === 1080 && exp.h === 1920);
  check('저장 이미지 작품 영역에 똥 픽셀', exp.brown > 2000, 'brown=' + exp.brown);
  check('저장 이미지 작품이 영역을 크게 채움', exp.fill >= 0.85, 'fill=' + (exp.fill * 100).toFixed(0) + '%');
  check('저장 이미지 상단 여백 비어 있음', exp.topInk === 0);
  await page.evaluate(() => { navigator.canShare = undefined; });
  const dl = page.waitForEvent('download', { timeout: 3000 }).catch(() => null);
  await page.tap('#btn-save'); await sleep(600);
  const dlRes = await dl;
  check('저장 버튼 → 다운로드 발생', !!dlRes, dlRes ? dlRes.suggestedFilename() : 'none');
  check('저장 폴백 미리보기 모달', await page.$eval('#save-modal', el => el.classList.contains('open')));
  await page.screenshot({ path: path.join(SHOT, 'qa-05-save-390.png') });
  await page.tap('#save-close'); await sleep(100);

  // 응모하기: 버튼(검정 채움, 저장 버튼 아래) → 안내 모달(주소 · 작품 저장 · 메일 보내기) · mailto 받는 사람/제목/본문 · 작품 저장은 기존 다운로드 흐름
  const applyBtn = await page.evaluate(() => { const b = document.getElementById('btn-apply'); const cs = getComputedStyle(b); const r = b.getBoundingClientRect(); const sv = document.getElementById('btn-save').getBoundingClientRect(); return { text: b.textContent.trim(), bg: cs.backgroundColor, color: cs.color, below: r.top >= sv.bottom, w: r.width }; });
  check('결과 화면 응모하기 버튼(검정 채움 · 저장 버튼 아래)', applyBtn.text === '응모하기' && applyBtn.bg === 'rgb(0, 0, 0)' && applyBtn.color === 'rgb(255, 255, 255)' && applyBtn.below, JSON.stringify(applyBtn));
  await page.tap('#btn-apply'); await sleep(150);
  const applyUi = await page.evaluate(() => ({ open: document.getElementById('apply-modal').classList.contains('open'), mail: document.getElementById('apply-mail').textContent.trim(), text: document.querySelector('.apply-text').innerText }));
  check('응모 안내 모달: 메일 주소 표시 · 첨부/아이디 안내', applyUi.open && applyUi.mail === CFG.APPLY_EMAIL && applyUi.text.includes('첨부') && applyUi.text.includes('인스타그램 아이디'), applyUi.mail);
  const mailto = await page.evaluate(() => PD_DEBUG.applyMailto());
  const mailtoBody = decodeURIComponent(mailto.split('&body=')[1] || '');
  check('메일 보내기 링크: 받는 사람 · 제목 · 본문(아이디 · 첨부 안내 · 기록)', mailto.startsWith('https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(CFG.APPLY_EMAIL) + '&su=' + encodeURIComponent(CFG.APPLY_SUBJECT) + '&body=') && mailtoBody.includes('인스타그램 아이디') && mailtoBody.includes('첨부') && mailtoBody.includes('번'), mailto.slice(0, 70));
  const dl2 = page.waitForEvent('download', { timeout: 3000 }).catch(() => null);
  await page.tap('#apply-save'); await sleep(600);
  check('응모 모달의 작품 저장 → 다운로드 발생', !!(await dl2));
  if (await page.$eval('#save-modal', el => el.classList.contains('open'))) { await page.tap('#save-close'); await sleep(100); }
  await page.screenshot({ path: path.join(SHOT, 'qa-05b-apply-390.png') });
  await page.tap('#apply-close'); await sleep(100);
  check('응모 안내 모달 닫기', !(await page.$eval('#apply-modal', el => el.classList.contains('open'))));

  await page.tap('#btn-again'); await sleep(100); await page.tap('#modal-ok'); await sleep(200);
  s = await snap(page);
  check('다시 그리기 → 초기화', s.state === 'play' && s.n === 0 && s.stats.poops === 0 && s.stats.distance === 0 && s.dir === CFG.INITIAL_DIR);

  const perf = await page.evaluate(async () => {
    const s = PD_DEBUG.world.snapshot();
    for (let i = 0; i < 1500; i++) s.poops.push({ x: s.x + (Math.random() - 0.5) * 360, y: s.y + (Math.random() - 0.5) * 500, t: -10 });
    await new Promise(r => setTimeout(r, 200));
    const times = [];
    for (let i = 0; i < 60; i++) { const t0 = performance.now(); await new Promise(r => requestAnimationFrame(r)); times.push(performance.now() - t0); }
    times.sort((a, b) => a - b);
    return { avg: times.reduce((a, b) => a + b, 0) / times.length, p90: times[Math.floor(times.length * 0.9)], n: s.poops.length };
  });
  check('똥 1500개 프레임 간격(헤드리스 소프트웨어 렌더)', perf.avg < 40, 'avg=' + perf.avg.toFixed(1) + 'ms p90=' + perf.p90.toFixed(1) + 'ms n=' + perf.n);
  await page.screenshot({ path: path.join(SHOT, 'qa-06-perf-1500.png') });

  check('콘솔/페이지 에러 없음', errors.length === 0, errors.join(' | ').slice(0, 200));
  await ctx.close();
}

/* 배변 모션 프레임 시트(옆모습) + 4방향 걷기/앉기/배변 프레임 */
async function motionSheet(browser) {
  console.log('\n[배변 모션 프레임 · 4방향]');
  const { ctx, page, CFG } = await openPage(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
  await page.tap('#btn-start'); await sleep(200);
  const clipOf = async () => { const s = await snap(page); const cam = await page.evaluate(() => PD_DEBUG.camera.get()); const vw = 390, vh = 844;
    const sx = (s.x - cam.x) * cam.scale + vw / 2, sy = (s.y - cam.y) * cam.scale + vh / 2; return { x: Math.max(0, sx - 70), y: Math.max(0, sy - 90), width: 140, height: 125 }; };
  // 옆모습 전체 시퀀스
  await page.keyboard.down('ArrowRight'); await sleep(420);
  await page.screenshot({ path: path.join(SHOT, 'qa-motion-0-walk.png'), clip: await clipOf() });
  await page.keyboard.up('ArrowRight'); await sleep(300);
  const clip = await clipOf();
  await page.screenshot({ path: path.join(SHOT, 'qa-motion-1-idle.png'), clip });
  const S0 = CFG.STOP_MS, S1 = S0 + CFG.SQUAT_MS, S2 = S1 + CFG.STRAIN_MS, S3 = S2 + CFG.POOP_EMERGE_MS, S4 = S3 + CFG.POOP_FALL_MS;
  const stamps = [
    { name: '2-stop', at: S0 * 0.5 }, { name: '3-squat-mid', at: S0 + CFG.SQUAT_MS * 0.5 }, { name: '4-seated', at: S1 + 20 },
    { name: '5-strain-push', at: S1 + CFG.STRAIN_MS * 0.25 }, { name: '6-poop-emerge', at: S2 + CFG.POOP_EMERGE_MS * 0.7 },
    { name: '7-poop-fall', at: S3 + CFG.POOP_FALL_MS * 0.55 }, { name: '8-land-squash', at: S4 + CFG.POOP_LAND_MS * 0.5 },
    { name: '9-rise', at: S4 + CFG.RISE_MS * 0.5 }, { name: '10-idle', at: S4 + CFG.RISE_MS + 120 },
  ];
  const t0 = Date.now();
  await page.keyboard.press('Space');
  for (const st of stamps) {
    const wait = st.at - (Date.now() - t0);
    if (wait > 0) await sleep(wait);
    const s = await snap(page);
    await page.screenshot({ path: path.join(SHOT, 'qa-motion-' + st.name + '.png'), clip });
    console.log('  ' + st.name.padEnd(14) + ' action=' + s.action.padEnd(6) + ' crouch=' + s.crouch.toFixed(2) + ' push=' + s.push.toFixed(2) + (s.anim ? ' poop=' + s.anim.phase + ' s=' + s.anim.sx.toFixed(2) + '/' + s.anim.sy.toFixed(2) + ' y=' + s.anim.y.toFixed(1) : ''));
  }
  // 4방향: 걷는 중 프레임 2장(위상 다르게) + 완전히 앉은 프레임 + 똥 나온 직후 프레임
  const dirKeys = { right: 'ArrowRight', left: 'ArrowLeft', down: 'ArrowDown', up: 'ArrowUp' };
  for (const dir of ['down', 'up', 'left']) {
    await page.keyboard.down(dirKeys[dir]); await sleep(380);
    await page.screenshot({ path: path.join(SHOT, 'qa-dir-' + dir + '-walk-a.png'), clip: await clipOf() });
    await sleep(70);
    await page.screenshot({ path: path.join(SHOT, 'qa-dir-' + dir + '-walk-b.png'), clip: await clipOf() });
    await page.keyboard.up(dirKeys[dir]); await sleep(320);
    const c2 = await clipOf();
    await page.screenshot({ path: path.join(SHOT, 'qa-dir-' + dir + '-idle.png'), clip: c2 });
    const t1 = Date.now();
    await page.keyboard.press('Space');
    for (const st of [{ name: 'seated', at: S1 + CFG.STRAIN_MS * 0.3 }, { name: 'poop', at: S3 + CFG.POOP_FALL_MS * 0.5 }, { name: 'landed', at: S4 + CFG.RISE_MS + 150 }]) {
      const wait = st.at - (Date.now() - t1); if (wait > 0) await sleep(wait);
      await page.screenshot({ path: path.join(SHOT, 'qa-dir-' + dir + '-' + st.name + '.png'), clip: c2 });
    }
    const s = await snap(page);
    console.log('  dir=' + dir.padEnd(5) + ' 똥 위치 dx=' + (s.poops[s.poops.length - 1].x - s.x).toFixed(1) + ' dy=' + (s.poops[s.poops.length - 1].y - s.y).toFixed(1) + ' front=' + s.poops[s.poops.length - 1].f);
  }
  await ctx.close();
}

/* 포즈 시트: 방향 × 상태별로 실제 게임이 고르는 시트 프레임을 같은 배율로 한 장에 — 그림 함수만 직접 호출(결정적) */
async function poseSheet(browser) {
  console.log('\n[포즈 시트]');
  const { ctx, page } = await openPage(browser, { viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  await page.waitForFunction(() => PD.characterSprite && PD.characterSprite.ready && PD.sprites.isLoaded());
  const info = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.id = 'pose-sheet'; c.width = 1560; c.height = 980;
    c.style.cssText = 'position:fixed;left:0;top:0;z-index:999;background:#fff';
    document.body.appendChild(c);
    const g = c.getContext('2d'); const sc = 2.0;
    const faces = [
      { label: 'front', f: { x: 0, y: 1 } }, { label: 'front-right', f: { x: Math.SQRT1_2, y: Math.SQRT1_2 } }, { label: 'right', f: { x: 1, y: 0 } },
      { label: 'back-right', f: { x: Math.SQRT1_2, y: -Math.SQRT1_2 } }, { label: 'back', f: { x: 0, y: -1 } }, { label: 'left', f: { x: -1, y: 0 } },
    ];
    const poses = [
      { label: 'idle', p: {} },
      { label: 'walk 0', p: { state: 'walk', walkPhase: 0, walkBlend: 1, moving: true } },
      { label: 'walk π/2', p: { state: 'walk', walkPhase: Math.PI / 2, walkBlend: 1, moving: true } },
      { label: 'walk π', p: { state: 'walk', walkPhase: Math.PI, walkBlend: 1, moving: true } },
      { label: 'walk 3π/2', p: { state: 'walk', walkPhase: 1.5 * Math.PI, walkBlend: 1, moving: true } },
      { label: 'squat 준비1', p: { state: 'squat', t: 0.2, crouch: 0.3 } },
      { label: 'squat 준비2', p: { state: 'squat', t: 0.8, crouch: 0.9 } },
      { label: 'strain 싸기1', p: { state: 'strain', crouch: 1, strain: 1 } },
      { label: 'poop 싸기3', p: { state: 'poop', t: 0.8, crouch: 1 } },
      { label: 'rise 일어남1', p: { state: 'rise', t: 0.3, crouch: 0.6 } },
    ];
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    faces.forEach((fc, r) => poses.forEach((po, col) => {
      const x = 80 + col * 150, y = 140 + r * 160;
      const dir = Math.abs(fc.f.x) >= Math.abs(fc.f.y) ? (fc.f.x > 0 ? 'right' : 'left') : (fc.f.y > 0 ? 'down' : 'up');
      const facing = fc.f.x < 0 ? -1 : 1;
      const pose = Object.assign({ state: 'idle', t: 0, dir, facing, face: fc.f, crouch: 0, strain: 0, push: 0, walkPhase: 0, walkBlend: 0, moving: false, turn: null, time: 1 }, po.p);
      if (!PD.characterSprite.draw(g, x, y, sc, 1, pose)) { g.save(); g.translate(x, y); g.scale(sc, sc); PD.character.draw(g, pose); g.restore(); }
      const id = PD.characterSprite.pick(pose);
      g.fillStyle = '#999'; g.font = '11px sans-serif'; g.textAlign = 'center'; g.fillText(fc.label + ' · ' + po.label, x, y + 18); g.fillText(id.id + (id.flip ? ' ⇋' : ''), x, y + 31);
    }));
    return { ok: true };
  });
  await page.screenshot({ path: path.join(SHOT, 'qa-pose-sheet.png'), clip: { x: 0, y: 0, width: 1560, height: 980 } });
  console.log('  screenshot/qa-pose-sheet.png (sprite=' + info.ok + ')');
  await ctx.close();
}

async function layoutShots(browser) {
  console.log('\n[레이아웃 스크린샷]');
  const sets = [
    { name: '320x568', vp: { width: 320, height: 568 }, touch: true },
    { name: '430x900', vp: { width: 430, height: 900 }, touch: true },
    { name: 'pc-1280x800', vp: { width: 1280, height: 800 }, touch: false },
    { name: 'pc-1920x1080', vp: { width: 1920, height: 1080 }, touch: false },
  ];
  for (const set of sets) {
    const { ctx, page, errors } = await openPage(browser, { viewport: set.vp, hasTouch: set.touch, isMobile: set.touch, deviceScaleFactor: set.touch ? 2 : 1 });
    await page.screenshot({ path: path.join(SHOT, 'qa-intro-' + set.name + '.png') });
    const introFit = await page.evaluate(() => document.getElementById('screen-intro').scrollHeight <= document.getElementById('app').clientHeight + 1);
    check(set.name + ' 인트로 fit', introFit);
    const ev = await page.evaluate(() => {
      const intro = document.getElementById('screen-intro'), t = intro.innerText;
      const cta = document.getElementById('btn-start'), cs = getComputedStyle(cta), cr = cta.getBoundingClientRect();
      const lines = ['.event-kicker', '.event-prizes', '.event-foot'].map(s => intro.querySelector(s)).filter(Boolean).map(e => e.getBoundingClientRect());
      const fontPx = s => { const e = intro.querySelector(s); return e ? parseFloat(getComputedStyle(e).fontSize) : 99; };
      const plain = s => { const e = intro.querySelector(s); if (!e) return true; const c = getComputedStyle(e); return (c.backgroundColor === 'rgba(0, 0, 0, 0)' || c.backgroundColor === 'transparent') && c.borderStyle === 'none' && c.boxShadow === 'none'; };
      const inner = intro.querySelector('.screen-inner').getBoundingClientRect(), app = document.getElementById('app').getBoundingClientRect();
      const pv = document.getElementById('intro-img').getBoundingClientRect(), title = intro.querySelector('.game-title').getBoundingClientRect();
      return { sub: !!intro.querySelector('.game-sub'), emoji: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(t),
        text: t.includes('10,000 FOLLOWERS EVENT') && t.includes('사수 PICK 1명 5만원 · 추첨 10명 5천원') && t.includes('참여안내') && t.includes('@ccojik.dh') && !!intro.querySelector('.event-foot b .ig-icon') && !t.includes('원하는 곳에'),
        order: pv.bottom <= title.top + 1 && title.bottom <= cr.top + 1 && lines.length === 3 && cr.bottom + 24 <= lines[0].top,
        stacked: lines.length === 3 && lines[0].bottom <= lines[1].top + 1 && lines[1].bottom <= lines[2].top + 1,
        small: Math.max(fontPx('.event-kicker'), fontPx('.event-prizes'), fontPx('.event-foot')) <= 13,
        divider: !!intro.querySelector('.event-divider, .event-col'), plain: ['.intro-event', '.event-kicker', '.event-prizes', '.event-foot'].every(plain),
        overflow: intro.scrollWidth > app.width + 1, fit: intro.scrollHeight <= app.height + 1,
        centered: Math.abs((inner.left + inner.right) / 2 - (app.left + app.right) / 2) < 2 && Math.abs((cr.left + cr.right) / 2 - (app.left + app.right) / 2) < 2,
        balance: +((inner.top - app.top) / Math.max(1, app.bottom - inner.bottom)).toFixed(2), previewW: pv.width,
        ctaBg: cs.backgroundColor, ctaColor: cs.color, ctaW: cr.width, ctaH: cr.height, ctaRadius: parseFloat(cs.borderTopLeftRadius), ctaShadow: cs.boxShadow, ctaImage: cs.backgroundImage };
    });
    check(set.name + ' 인트로 구성: 이미지→제목→버튼→이벤트 3줄(세로) · 부제목·이모지·선·카드 없음 · 작은 글자 · 가운데 · 넘침 없음', !ev.sub && !ev.emoji && ev.text && ev.order && ev.stacked && ev.small && !ev.divider && ev.plain && !ev.overflow && ev.fit && ev.centered, JSON.stringify(ev));
    check(set.name + ' 인트로 세로 균형(위:아래 0.6~1.2) · 메인 사진 폭 min(180, 72vw)', ev.balance >= 0.6 && ev.balance <= 1.2 && Math.abs(ev.previewW - Math.min(180, set.vp.width * 0.72)) < 1, 'balance=' + ev.balance + ' img=' + ev.previewW);
    check(set.name + ' 인트로 시작 버튼: 검정 채움 · 흰 글자 · 200×48 · 라운드 ≤2px · 그림자/그라데이션 없음', ev.ctaBg === 'rgb(0, 0, 0)' && ev.ctaColor === 'rgb(255, 255, 255)' && Math.abs(ev.ctaW - 200) < 1 && Math.abs(ev.ctaH - 48) < 1 && ev.ctaRadius <= 2 && ev.ctaShadow === 'none' && ev.ctaImage === 'none', ev.ctaBg + ' ' + ev.ctaColor + ' ' + ev.ctaW + 'x' + ev.ctaH + ' r=' + ev.ctaRadius);
    await page.click('#btn-start'); await sleep(200);
    const hudGeo = await page.evaluate(() => { const app = document.getElementById('app').getBoundingClientRect(); const c = document.querySelector('.hud-count').getBoundingClientRect(), a = document.querySelector('.hud-actions').getBoundingClientRect(); return { off: (c.left + c.right) / 2 - (app.left + app.right) / 2, gap: a.left - c.right }; });
    check(set.name + ' HUD 카운트 ' + (set.vp.width >= 375 ? '가운데(±4px) · ' : '(좁은 화면: 남는 공간 가운데) · ') + '버튼과 겹침 없음', (set.vp.width < 375 || Math.abs(hudGeo.off) < 4) && hudGeo.gap >= 0, 'off=' + hudGeo.off.toFixed(1) + ' gap=' + hudGeo.gap.toFixed(0));
    await page.evaluate(() => { const s = PD_DEBUG.world.snapshot(); for (let i = 0; i < 12; i++) { s.poops.push({ x: s.x - 70 + i * 12, y: s.y - 50 - Math.abs(i - 6) * 7, t: -10 }); s.stats.poops++; } });
    await page.keyboard.press('Space'); await sleep(380);
    await page.screenshot({ path: path.join(SHOT, 'qa-play-' + set.name + '.png') });
    const geo = await page.evaluate(() => {
      const r = id => { const b = document.getElementById(id).getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
      const app = r('app');
      const cam = PD_DEBUG.camera.get(); const s = PD_DEBUG.world.snapshot();
      const charY = (s.y - cam.y) * cam.scale + PD_DEBUG.viewH / 2;
      return { app, controls: r('controls'), poop: r('btn-poop'), dpad: r('dpad'), charY, pcKeys: !!document.querySelector('.pc-keys'), hintSpace: document.getElementById('hint').innerText.includes('SPACE 싸기'), poopDisp: getComputedStyle(document.getElementById('btn-poop')).display };
    });
    if (set.touch) check(set.name + ' 앱 프레임 ≤ 430(모바일)', geo.app.w <= 430.5, 'w=' + geo.app.w);
    else {
      const pcInfo = await page.evaluate(() => ({ scale: PD_DEBUG.camera.get().scale, play: PD_DEBUG.camera.playScale, cw: document.getElementById('stage').width, dpr: window.devicePixelRatio, scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight }));
      check(set.name + ' PC: 앱이 브라우저 전체 폭(9:16 제한 없음)', geo.app.w === set.vp.width && geo.app.h === set.vp.height, 'app=' + geo.app.w + '×' + geo.app.h);
      check(set.name + ' PC: 캔버스 해상도 = CSS 폭×DPR, 스크롤 없음', pcInfo.cw === Math.round(set.vp.width * pcInfo.dpr) && pcInfo.scrollW <= set.vp.width && pcInfo.scrollH <= set.vp.height, 'canvas=' + pcInfo.cw + ' dpr=' + pcInfo.dpr);
      check(set.name + ' PC: 플레이 배율 1.25배(' + pcInfo.play + ')', near(pcInfo.scale, 1.375, 0.001) && near(pcInfo.play, 1.375, 0.001));
    }
    check(set.name + ' 캐릭터가 컨트롤 위쪽', geo.charY < geo.controls.t - 10, 'charY=' + geo.charY.toFixed(0) + ' controlsTop=' + geo.controls.t.toFixed(0));
    check(set.name + ' D-pad·💩 ' + (set.touch ? '표시' : '숨김'), set.touch ? (geo.dpad.w > 0 && geo.poopDisp !== 'none') : (geo.dpad.w === 0 && geo.poopDisp === 'none'));
    check(set.name + ' 우하단 SPACE 라벨 없음' + (set.touch ? '' : ' · PC 안내 문구에 SPACE 싸기 포함'), !geo.pcKeys && (set.touch || geo.hintSpace));
    await sleep(900);
    await page.click('#btn-done'); await sleep(100); await page.click('#modal-ok'); await sleep(700);
    const resFit = await page.evaluate(() => document.getElementById('screen-result').scrollHeight <= document.getElementById('app').clientHeight + 1);
    check(set.name + ' 결과 fit', resFit);
    await page.screenshot({ path: path.join(SHOT, 'qa-result-' + set.name + '.png') });
    check(set.name + ' 에러 없음', errors.length === 0, errors.join(' | ').slice(0, 200));
    await ctx.close();
  }
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const only = process.argv[2]; // --pose : 포즈 시트만 (캐릭터 그림 튜닝용)
  try {
    if (only === '--pose') { await poseSheet(browser); }
    else {
      await mobileFlow(browser);
      await motionSheet(browser);
      await poseSheet(browser);
      await layoutShots(browser);
    }
  } finally {
    await browser.close();
  }
  console.log('\nPASS ' + pass + ' / FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
