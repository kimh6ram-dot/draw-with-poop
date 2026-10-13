/* assets/캐릭터 스프라이트 시트 PNG.png → src/game/character-data.js
 * 시트의 각 프레임을 잘라 받침 접시·구워진 똥을 지우고, 발 기준점(접시 중심)과 배율(접시 폭)을 기록해 base64 로 내장한다.
 * 사용: node tools/build-character.js [--debug]   (--debug: screenshot/char-*.png 에 정리 결과 확인용 시트 출력)
 *
 * 원칙: 캐릭터 픽셀(머리·얼굴·몸·옷·손발)은 손대지 않는다. 지우는 것은 ①접시(흰/회색 타원, 발 아래 띠 안의 저채도 밝은 픽셀)
 * ②싸기2·3에 그려진 똥(갈색) ③투명 픽셀의 RGB(갈색 배경 번짐 방지)뿐. 양말(흰색)은 접시 띠에 겹쳐 함께 지워질 수 있다 — 발목 1~2px 라
 * 게임 크기(약 60px)에서는 보이지 않는다. */
'use strict';
const fs = require('fs');
const path = require('path');
const png = require('./png');

const ROOT = path.join(__dirname, '..');
const SHEET_ORIGINAL = path.join(ROOT, 'assets', '캐릭터 스프라이트 시트 PNG.png');
const SHEET_RECOLORED = path.join(ROOT, 'assets', '캐릭터 스프라이트 시트 PNG (바지 아이보리).png'); // tools/recolor-shorts.js 출력(바지 아이보리)
const DEBUG = process.argv.includes('--debug');
const SHEET = (!process.argv.includes('--original') && fs.existsSync(SHEET_RECOLORED)) ? SHEET_RECOLORED : SHEET_ORIGINAL;
console.log('시트:', path.basename(SHEET));

/* 프레임 정의: [이름, x0, y0, x1, y1(배타), 옵션]. 좌표는 알파 연결요소 분석(tools 메모)으로 구한 bbox + 여유.
 * 옵션: plate — 접시 제거 + 접시 중심을 기준점으로, erasePoop — 갈색 똥 지우기, poopObj — 똥 오브젝트(바닥 중심 기준) */
const FRAMES = [
  ['idle_front',      132, 36, 328, 346, { plate: true }],
  ['idle_left',       352, 36, 536, 346, { plate: true }],
  ['idle_back',       569, 36, 765, 346, { plate: true }],
  ['idle_right',      799, 36, 982, 346, { plate: true }],
  ['idle_diag_left', 1020, 36, 1202, 346, { plate: true }],
  ['idle_diag_right',1243, 36, 1420, 346, { plate: true }],
  // 걷기 14프레임(오른쪽 보기). 1~12 루프, 13·14 는 정면으로 돌아서는 정지 프레임
  ...[[62,162],[163,262],[262,362],[367,468],[465,563],[563,662],[660,762],[763,868],[865,967],[965,1063],[1063,1161],[1159,1260],[1258,1361],[1362,1464]]
    .map(([x0, x1], i) => ['walk_' + String(i + 1).padStart(2, '0'), x0, 424, x1, 568, { plate: true }]),
  ['poop_wait',    98, 612, 224, 810, { plate: true }],
  ['poop_ready1', 262, 612, 406, 810, { plate: true }],
  ['poop_ready2', 445, 612, 591, 810, { plate: true }],
  ['poop_do1',    621, 612, 765, 810, { plate: true }],
  ['poop_do2',    792, 612, 931, 810, { plate: true, erasePoop: true }],
  ['poop_do3',    966, 612, 1122, 810, { plate: true, erasePoop: true }],
  ['poop_rise1', 1161, 612, 1285, 810, { plate: true }],
  ['poop_rise2', 1341, 612, 1464, 810, { plate: true }],
  // 똥 애니메이션 6프레임(접시 제외, 똥만). 1~3 은 공중, 4~6 은 착지
  ['poopanim_1', 118, 898, 166, 952, { poopObj: true }],
  ['poopanim_2', 224, 894, 276, 952, { poopObj: true }],
  ['poopanim_3', 350, 882, 410, 950, { poopObj: true }],
  ['poopanim_4', 470, 900, 558, 976, { poopObj: true, plate: true }],
  ['poopanim_5', 598, 904, 704, 978, { poopObj: true, plate: true }],
  ['poopanim_6', 736, 902, 843, 978, { poopObj: true, plate: true }],
  // 표정(정면 전용, 현재 미사용 — 참고용으로 포함)
  ['expr_basic', 1095, 866, 1212, 964, {}],
  ['expr_angry', 1222, 866, 1331, 964, {}],
  ['expr_happy', 1353, 866, 1462, 964, {}],
];

const img = png.decode(fs.readFileSync(SHEET));
const W = img.width, D = img.data;

function cropRaw(x0, y0, x1, y1) {
  const w = x1 - x0, h = y1 - y0, out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) D.copy(out, y * w * 4, ((y0 + y) * W + x0) * 4, ((y0 + y) * W + x1) * 4);
  return { width: w, height: h, data: out };
}
const px = (f, x, y) => { const o = (y * f.width + x) * 4; return [f.data[o], f.data[o + 1], f.data[o + 2], f.data[o + 3]]; };
// 접시 색: 흰~회색(가장자리 그라데이션·신발 그림자 포함). 저채도이고 어둡지 않은 것. 머리카락(어두움)·피부(채도 높음)·신발(어두움)은 제외
const isPlateColor = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx >= 92 && mx - mn <= 40; };
const isPoopColor = (r, g, b) => r >= 110 && r - b >= 55 && g >= 55 && g <= r - 25 && b <= 140;

/* 구운 똥 지우기: 똥의 "진한 주황갈색"(파랑 성분이 낮음 — 그늘진 피부는 파랑이 높아 제외)을 핵심 픽셀로 보고,
 * 프레임 아래쪽 절반에서 가장 큰 연결요소를 똥으로 잡는다. 그 요소를 3px 팽창한 영역 안에서 신발(어두움)과 밝은 피부만 남기고 지운다.
 * 캐릭터 본체(얼굴·손·옷)는 영역 밖이라 손대지 않는다. */
function erasePoop(f) {
  const w = f.width, h = f.height;
  const core = (r, g, b) => r >= 110 && r - b >= 90 && b <= 95 && g >= 55 && g <= 150;
  const mask = new Uint8Array(w * h);
  for (let y = Math.round(h * 0.5); y < h; y++) for (let x = Math.round(w * 0.3); x < w; x++) {
    const o = (y * w + x) * 4; if (f.data[o + 3] >= 60 && core(f.data[o], f.data[o + 1], f.data[o + 2])) mask[y * w + x] = 1;
  }
  const seen = new Uint8Array(w * h); let best = null;
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || seen[i]) continue;
    const comp = []; const stack = [i]; seen[i] = 1;
    while (stack.length) { const p = stack.pop(); comp.push(p); const px_ = p % w, py_ = (p / w) | 0;
      [[px_ - 1, py_], [px_ + 1, py_], [px_, py_ - 1], [px_, py_ + 1]].forEach(([qx, qy]) => { if (qx < 0 || qy < 0 || qx >= w || qy >= h) return; const q = qy * w + qx; if (mask[q] && !seen[q]) { seen[q] = 1; stack.push(q); } }); }
    if (!best || comp.length > best.length) best = comp;
  }
  if (!best || best.length < 80) { console.warn('  (구운 똥을 찾지 못함)'); return; }
  const region = new Uint8Array(w * h);
  best.forEach(p => { const px_ = p % w, py_ = (p / w) | 0; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const qx = px_ + dx, qy = py_ + dy; if (qx >= 0 && qy >= 0 && qx < w && qy < h) region[qy * w + qx] = 1; } });
  let n = 0;
  for (let i = 0; i < w * h; i++) {
    if (!region[i]) continue;
    const o = i * 4, r = f.data[o], g = f.data[o + 1], b = f.data[o + 2];
    if (f.data[o + 3] < 8) continue;
    const mx = Math.max(r, g, b);
    if (mx < 95) continue;                              // 신발·머리카락(어두움) 보존
    if (b >= 140 && r >= 215 && g >= 150) continue;      // 밝은 피부 보존
    f.data[o + 3] = 0; n++;
  }
  console.log('  구운 똥 제거: 핵심 ' + best.length + 'px, 지움 ' + n + 'px');
}

/* 알파 ≥ 60 픽셀의 연결요소 중 minPx 미만인 것(고립된 점·선)을 투명하게 */
function removeSpecks(f, minPx) {
  const w = f.width, h = f.height, seen = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || f.data[i * 4 + 3] < 60) continue;
    const comp = [], stack = [i]; seen[i] = 1;
    while (stack.length) { const p = stack.pop(); comp.push(p); const px_ = p % w, py_ = (p / w) | 0;
      [[px_ - 1, py_], [px_ + 1, py_], [px_, py_ - 1], [px_, py_ + 1]].forEach(([qx, qy]) => { if (qx < 0 || qy < 0 || qx >= w || qy >= h) return; const q = qy * w + qx; if (!seen[q] && f.data[q * 4 + 3] >= 60) { seen[q] = 1; stack.push(q); } }); }
    if (comp.length < minPx) comp.forEach(p => { f.data[p * 4 + 3] = 0; });
  }
}

/* 접시: 아래쪽 띠에서 불투명 폭이 가장 넓은 행(타원의 가로 지름)을 찾고, 대칭으로 띠를 잡는다 */
function findPlate(f) {
  const h = f.height, w = f.width;
  let bottom = -1; const ext = [];
  for (let y = 0; y < h; y++) { let l = -1, r = -1; for (let x = 0; x < w; x++) { if (px(f, x, y)[3] >= 120) { if (l < 0) l = x; r = x; } } ext.push([l, r]); if (l >= 0) bottom = y; }
  let best = -1, bestW = 0;
  // 타원 가장자리는 안티앨리어싱으로 어두우므로 3px 안쪽 픽셀을 완화된 기준으로 본다
  const soft = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx >= 120 && mx - mn <= 48; };
  for (let y = Math.max(0, bottom - Math.round(h * 0.25)); y <= bottom; y++) {
    const [l, r] = ext[y]; if (l < 0 || r - l < 10) continue;
    const [pr, pg, pb] = px(f, Math.min(w - 1, l + 3), y), [qr, qg, qb] = px(f, Math.max(0, r - 3), y);
    if (!soft(pr, pg, pb) || !soft(qr, qg, qb)) continue;
    const ww = r - l + 1; if (ww > bestW) { bestW = ww; best = y; }
  }
  if (best < 0) return null;
  const [l, r] = ext[best];
  const half = bottom - best;
  return { cx: (l + r) / 2, cy: best, width: bestW, top: best - half - 2, bottom };
}

function cleanFrame(f, opt) {
  const w = f.width, h = f.height;
  let plate = null;
  if (opt.erasePoop) erasePoop(f); // 구운 똥을 먼저 지운다 — 접시 폭 측정에 끼어들지 않게
  if (opt.plate) {
    plate = findPlate(f);
    if (!plate) throw new Error('접시를 찾지 못함');
    for (let y = Math.max(0, plate.top); y <= plate.bottom; y++) for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4; if (f.data[o + 3] < 8) continue;
      if (isPlateColor(f.data[o], f.data[o + 1], f.data[o + 2])) f.data[o + 3] = 0;
    }
  }
  // 투명 픽셀 RGB 를 이웃 불투명 색으로 채움(확대/축소 보간 때 갈색 배경이 번지지 않게) — 3회 팽창
  for (let pass = 0; pass < 3; pass++) {
    const src = Buffer.from(f.data);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4; if (src[o + 3] >= 8) continue;
      let r = 0, g = 0, b = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const q = (yy * w + xx) * 4; if (src[q + 3] >= 8 || (pass > 0 && (src[q] | src[q + 1] | src[q + 2]) && src[q + 3] === 1)) { r += src[q]; g += src[q + 1]; b += src[q + 2]; n++; } }
      if (n) { f.data[o] = Math.round(r / n); f.data[o + 1] = Math.round(g / n); f.data[o + 2] = Math.round(b / n); f.data[o + 3] = 1; } // alpha 1 = "채워진 투명"(다음 pass 전파용)
    }
  }
  for (let i = 3; i < f.data.length; i += 4) if (f.data[i] === 1) f.data[i] = 0;
  removeSpecks(f, 60); // 접시·똥 제거 뒤 남은 고립된 작은 조각(그림자 선·점) 정리 — 캐릭터 본체는 한 덩어리라 영향 없음
  // 실제 bbox 로 다시 크롭
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (f.data[(y * w + x) * 4 + 3] >= 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, out = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y++) f.data.copy(out, y * cw * 4, ((y0 + y) * w + x0) * 4, ((y0 + y) * w + x1 + 1) * 4);
  const g = { width: cw, height: ch, data: out };
  // 기준점·배율(ppu 는 아래에서 줄별 기준 키로 다시 정한다)
  let ax, ay, ppu;
  if (opt.poopObj) { ax = cw / 2; ay = ch; ppu = cw; } // 똥: 바닥 중심, 배율은 자기 폭(런타임에서 마지막 프레임 폭 기준으로 정규화)
  else if (plate) { ax = plate.cx - x0; ay = plate.cy - y0; ppu = plate.width; }
  else { ax = cw / 2; ay = ch; ppu = cw; }
  let res = { img: g, ax, ay, ppu, plate, cropY0: y0, k: 1 };
  if (opt.scale && opt.scale !== 1) { res = resample(res, opt.scale); res.cropY0 = y0; res.k = opt.scale; }
  return res;
}

/* 정면·후면 걷기용 신체 부위 분리(시트에 정면·후면 걷기 프레임이 없다). 원본 픽셀은 그대로, 영역만 나눈다.
 * regions = { hem: 바지 밑단(높이 비율), legX:[x0,xm,x1], armY:[y0,y1], armL:[x0,x1], armR:[x0,x1] } (프레임 폭·높이 비율)
 * 다리 조각은 밑단부터 아래, 몸통 조각은 밑단+2px 까지(겹침 → 이음새 없음, 다리는 위로만 움직여 바지 뒤로 숨는다).
 * 팔 조각은 소매 아래 2px 부터 손까지(겹침), 축(pivot)은 조각 윗변 중앙(소매 끝). */
function splitParts(res, R) {
  const im = res.img, w = im.width, h = im.height;
  const Y = v => Math.round(h * v), X = v => Math.round(w * v);
  const hem = Y(R.hem), armY0 = Y(R.armY[0]), armY1 = Y(R.armY[1]);
  const boxes = {
    legL: { x0: X(R.legX[0]), x1: X(R.legX[1]), y0: hem, y1: h },
    legR: { x0: X(R.legX[1]), x1: X(R.legX[2]), y0: hem, y1: h },
    armL: { x0: X(R.armL[0]), x1: X(R.armL[1]), y0: armY0, y1: armY1 },
    armR: { x0: X(R.armR[0]), x1: X(R.armR[1]), y0: armY0, y1: armY1 },
  };
  const parts = {};
  const cut = (b) => { // 영역을 실제 불투명 bbox 로 타이트하게 잘라낸 조각
    let x0 = b.x1, y0 = b.y1, x1 = -1, y1 = -1;
    for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) if (im.data[(y * w + x) * 4 + 3] >= 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return null;
    const pw = x1 - x0 + 1, ph = y1 - y0 + 1, buf = Buffer.alloc(pw * ph * 4);
    for (let y = 0; y < ph; y++) im.data.copy(buf, y * pw * 4, ((y0 + y) * w + x0) * 4, ((y0 + y) * w + x1 + 1) * 4);
    return { img: { width: pw, height: ph, data: buf }, ox: x0, oy: y0 };
  };
  for (const k in boxes) { const p = cut(boxes[k]); if (!p) throw new Error('부위 영역이 비어 있음: ' + k); parts[k] = p; }
  parts.armL.px = (boxes.armL.x0 + boxes.armL.x1) / 2; parts.armL.py = armY0 + 2;
  parts.armR.px = (boxes.armR.x0 + boxes.armR.x1) / 2; parts.armR.py = armY0 + 2;
  // 몸통: 다리(밑단+2px 아래)·팔(소매+2px 아래) 영역을 지운 나머지
  const body = Buffer.from(im.data);
  const clear = (b, yFrom) => { for (let y = yFrom; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) body[(y * w + x) * 4 + 3] = 0; };
  clear(boxes.legL, hem + 2); clear(boxes.legR, hem + 2); clear(boxes.armL, armY0 + 2); clear(boxes.armR, armY0 + 2);
  parts.body = { img: { width: w, height: h, data: body }, ox: 0, oy: 0 };
  return parts;
}

/* 알파 가중 이중선형 축소(원본 그림은 그대로, 해상도만 줄인다 — 게임 표시 크기(최대 약 180px)보다 크면 낭비) */
function resample(res, k) {
  const src = res.img, w = Math.max(1, Math.round(src.width * k)), h = Math.max(1, Math.round(src.height * k));
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const fx = (x + 0.5) / k - 0.5, fy = (y + 0.5) / k - 0.5;
    const x0 = Math.max(0, Math.floor(fx)), y0 = Math.max(0, Math.floor(fy)), x1 = Math.min(src.width - 1, x0 + 1), y1 = Math.min(src.height - 1, y0 + 1);
    const tx = Math.min(1, Math.max(0, fx - x0)), ty = Math.min(1, Math.max(0, fy - y0));
    let r = 0, g = 0, b = 0, a = 0;
    [[x0, y0, (1 - tx) * (1 - ty)], [x1, y0, tx * (1 - ty)], [x0, y1, (1 - tx) * ty], [x1, y1, tx * ty]].forEach(([sx, sy, wgt]) => {
      const o = (sy * src.width + sx) * 4, al = src.data[o + 3] * wgt;
      r += src.data[o] * al; g += src.data[o + 1] * al; b += src.data[o + 2] * al; a += al;
    });
    const o = (y * w + x) * 4;
    if (a > 0) { out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a); }
    out[o + 3] = Math.round(a);
  }
  return { img: { width: w, height: h, data: out }, ax: res.ax * k, ay: res.ay * k, ppu: res.ppu * k, plate: res.plate };
}

const out = {}, report = [], results = {};
let debugCells = [];
for (const [name, x0, y0, x1, y1, opt] of FRAMES) {
  const raw = cropRaw(x0, y0, x1, y1);
  const o = Object.assign({}, opt || {});
  if (name.startsWith('idle_')) o.scale = 2 / 3; // 1행은 297px → 198px (게임 최대 표시 약 180px 이상 유지)
  results[name] = cleanFrame(raw, o);
}
/* 배율 통일: 줄마다 접시 크기 비율이 달라(1행 1.81 · 2행 1.45 · 3행 1.70) 접시 폭 대신 "서 있는 키"(머리 꼭대기~발 기준점)로 맞춘다.
 * 1 단위 = 서 있는 키. 각 줄의 서 있는 프레임을 기준으로 그 줄 전체에 같은 ppu(px per unit)를 준다 */
const GROUP_REF = { idle: 'idle_front', walk: 'walk_14', poop: 'poop_wait' };
const groupOf = n => n.startsWith('idle_') ? 'idle' : n.startsWith('walk_') ? 'walk' : n.startsWith('poop_') ? 'poop' : null;
/* 바닥선(기준점 y) 통일: 같은 줄의 접시는 시트에서 같은 높이에 있으므로, 프레임별 검출값(±2px 흔들림) 대신 줄 중앙값을 쓴다 → 프레임 전환 시 상하 떨림 없음 */
const frameY0 = {}; FRAMES.forEach(fr => { frameY0[fr[0]] = fr[2]; });
const cyByGroup = {};
for (const [name] of FRAMES) { const g = groupOf(name), res = results[name]; if (g && res.plate) (cyByGroup[g] = cyByGroup[g] || []).push(res.plate.cy + frameY0[name]); }
const median = a => { const b = a.slice().sort((p, q) => p - q); return b[Math.floor(b.length / 2)]; };
const cyMed = {}; for (const g in cyByGroup) cyMed[g] = median(cyByGroup[g]);
for (const [name] of FRAMES) { const g = groupOf(name), res = results[name]; if (g && res.plate) res.ay = (cyMed[g] - frameY0[name] - res.cropY0) * res.k; }
const groupPpu = {};
for (const g in GROUP_REF) groupPpu[g] = results[GROUP_REF[g]].ay; // 발 기준점까지의 높이 = 서 있는 키(px)
/* 정면·후면: 걷기 부위 분리 */
const PART_REGIONS = {
  idle_front: { hem: 0.84, legX: [0.27, 0.50, 0.73], armY: [0.60, 0.81], armL: [0.0, 0.26], armR: [0.74, 1.0] },
  idle_back:  { hem: 0.84, legX: [0.27, 0.50, 0.73], armY: [0.60, 0.81], armL: [0.0, 0.26], armR: [0.74, 1.0] },
};
for (const name in PART_REGIONS) results[name].parts = splitParts(results[name], PART_REGIONS[name]);
for (const [name] of FRAMES) {
  const res = results[name]; const g = groupOf(name);
  if (g) res.ppu = groupPpu[g];
  const buf = png.encode(res.img);
  out[name] = { w: res.img.width, h: res.img.height, ax: +res.ax.toFixed(1), ay: +res.ay.toFixed(1), ppu: +res.ppu.toFixed(1), src: 'data:image/png;base64,' + buf.toString('base64') };
  if (res.parts) {
    out[name].parts = {};
    for (const k in res.parts) { const p = res.parts[k]; const pb = png.encode(p.img); out[name].parts[k] = { w: p.img.width, h: p.img.height, ox: p.ox, oy: p.oy, px: p.px, py: p.py, src: 'data:image/png;base64,' + pb.toString('base64') }; }
  }
  report.push(name.padEnd(16) + ' ' + String(res.img.width).padStart(3) + 'x' + String(res.img.height).padEnd(3) + ' anchor(' + res.ax.toFixed(0) + ',' + res.ay.toFixed(0) + ') ppu ' + res.ppu.toFixed(0) + (res.plate ? ' plate w' + res.plate.width : '') + ' ' + (buf.length / 1024).toFixed(0) + 'KB');
  if (DEBUG) debugCells.push({ name, img: res.img, ax: res.ax, ay: res.ay, ppu: res.ppu });
}
console.log(report.join('\n'));
console.log('바닥선 중앙값(시트 y):', JSON.stringify(cyMed), '· 줄별 편차(px):', Object.keys(cyByGroup).map(g => g + ' ±' + (Math.max(...cyByGroup[g]) - Math.min(...cyByGroup[g]))).join(' '));
if (DEBUG) { // 부위 분리 확인: 다리 들어 올림·팔 회전을 과장해서 그린 시트
  const names = Object.keys(PART_REGIONS), cellW = 260, cellH = 260, SW = cellW * names.length * 2, SH = cellH, buf = Buffer.alloc(SW * SH * 4);
  for (let i = 0; i < buf.length; i += 4) { buf[i] = 225; buf[i + 1] = 232; buf[i + 2] = 240; buf[i + 3] = 255; }
  const blit = (img, X0, Y0, s) => { for (let y = 0; y < img.height * s; y++) for (let x = 0; x < img.width * s; x++) { const sx = (x / s) | 0, sy = (y / s) | 0, o = (sy * img.width + sx) * 4, a = img.data[o + 3] / 255; if (a <= 0) continue; const X = X0 + x, Y = Y0 + y; if (X < 0 || Y < 0 || X >= SW || Y >= SH) continue; const q = (Y * SW + X) * 4; buf[q] = Math.round(img.data[o] * a + buf[q] * (1 - a)); buf[q + 1] = Math.round(img.data[o + 1] * a + buf[q + 1] * (1 - a)); buf[q + 2] = Math.round(img.data[o + 2] * a + buf[q + 2] * (1 - a)); } };
  names.forEach((n, i) => {
    const r = results[n], P = r.parts, s = 1;
    const X0 = i * cellW * 2 + 20, Y0 = 20;
    blit(P.body.img, X0, Y0, s);                                   // 조립(겹침 확인)
    blit(P.legL.img, X0 + P.legL.ox, Y0 + P.legL.oy, s); blit(P.legR.img, X0 + P.legR.ox, Y0 + P.legR.oy, s);
    blit(P.armL.img, X0 + P.armL.ox, Y0 + P.armL.oy, s); blit(P.armR.img, X0 + P.armR.ox, Y0 + P.armR.oy, s);
    const X1 = X0 + cellW;                                         // 분해(다리 한쪽 올림·팔 벌림)
    blit(P.legL.img, X1 + P.legL.ox, Y0 + P.legL.oy - 12, s); blit(P.legR.img, X1 + P.legR.ox + 4, Y0 + P.legR.oy, s);
    blit(P.body.img, X1, Y0 - 3, s);
    blit(P.armL.img, X1 + P.armL.ox - 10, Y0 + P.armL.oy + 4, s); blit(P.armR.img, X1 + P.armR.ox + 10, Y0 + P.armR.oy + 4, s);
  });
  fs.writeFileSync(path.join(ROOT, 'screenshot', 'char-parts-sheet.png'), png.encode({ width: SW, height: SH, data: buf }));
  console.log('parts sheet: screenshot/char-parts-sheet.png');
}
// 똥 애니메이션 배율: 마지막(착지) 프레임 폭 = 1 로 정규화
const base = out.poopanim_6.ppu;
for (let i = 1; i <= 6; i++) out['poopanim_' + i].ppu = base;
out._meta = { standUnits: 1, groupPpu }; // 1 단위 = 서 있는 키 → 런타임이 CHARACTER_HEIGHT 에 맞춘다
console.log('standing px per group:', JSON.stringify(groupPpu));
const js = '/* 자동 생성: node tools/build-character.js — 캐릭터 스프라이트 시트에서 프레임을 잘라 접시·구운 똥 제거 후 base64 내장.\n * 각 프레임: w,h(px) · ax,ay(발 기준점 px) · ppu(접시 폭 px = 1 단위) */\nwindow.PD_CHARACTER = ' + JSON.stringify(out) + ';\n';
fs.writeFileSync(path.join(ROOT, 'src', 'game', 'character-data.js'), js);
console.log('written src/game/character-data.js', (js.length / 1024).toFixed(0) + 'KB');

if (DEBUG) {
  // 확인용 시트: 접시 제거·기준점(십자)·같은 배율로 정규화해 한 줄에
  const cellW = 150, cellH = 230, cols = 10, rows = Math.ceil(debugCells.length / cols);
  const SW = cellW * cols, SH = cellH * rows, buf = Buffer.alloc(SW * SH * 4);
  for (let i = 0; i < buf.length; i += 4) { buf[i] = 225; buf[i + 1] = 232; buf[i + 2] = 240; buf[i + 3] = 255; }
  const unitPx = 150; // 서 있는 키 150px 로 정규화(똥 프레임은 착지 폭 기준이라 작게 보인다)
  debugCells.forEach((c, i) => {
    const cx = (i % cols) * cellW + cellW / 2, cy = Math.floor(i / cols) * cellH + cellH - 40;
    const s = (c.name.startsWith('poopanim') ? 50 : unitPx) / c.ppu;
    // 목적지 픽셀 기준 역매핑(확대 시 구멍 없음)
    const X0 = Math.round(cx - c.ax * s), Y0 = Math.round(cy - c.ay * s), X1 = Math.round(cx + (c.img.width - c.ax) * s), Y1 = Math.round(cy + (c.img.height - c.ay) * s);
    for (let Y = Math.max(0, Y0); Y < Math.min(SH, Y1); Y++) for (let X = Math.max(0, X0); X < Math.min(SW, X1); X++) {
      const sx = Math.min(c.img.width - 1, Math.floor((X - cx) / s + c.ax)), sy = Math.min(c.img.height - 1, Math.floor((Y - cy) / s + c.ay));
      if (sx < 0 || sy < 0) continue;
      const o = (sy * c.img.width + sx) * 4, a = c.img.data[o + 3] / 255; if (a <= 0) continue;
      const q = (Y * SW + X) * 4; buf[q] = Math.round(c.img.data[o] * a + buf[q] * (1 - a)); buf[q + 1] = Math.round(c.img.data[o + 1] * a + buf[q + 1] * (1 - a)); buf[q + 2] = Math.round(c.img.data[o + 2] * a + buf[q + 2] * (1 - a));
    }
    for (let d = -6; d <= 6; d++) { const q1 = (cy * SW + cx + d) * 4, q2 = ((cy + d) * SW + cx) * 4; if (q1 >= 0 && q1 < buf.length) { buf[q1] = 255; buf[q1 + 1] = 0; buf[q1 + 2] = 0; } if (q2 >= 0 && q2 < buf.length) { buf[q2] = 255; buf[q2 + 1] = 0; buf[q2 + 2] = 0; } }
  });
  fs.mkdirSync(path.join(ROOT, 'screenshot'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'screenshot', 'char-build-sheet.png'), png.encode({ width: SW, height: SH, data: buf }));
  console.log('debug sheet: screenshot/char-build-sheet.png');
}
