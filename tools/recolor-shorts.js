/* 캐릭터 시트의 갈색 반바지를 상의와 같은 아이보리로 — 원본은 그대로 두고 수정본 PNG 를 만든다.
 * 입력: assets/캐릭터 스프라이트 시트 PNG.png (원본, 변경 없음)
 * 출력: assets/캐릭터 스프라이트 시트 PNG (바지 아이보리).png  → tools/build-character.js 가 이 파일이 있으면 우선 사용
 * 사용: node tools/recolor-shorts.js
 *
 * 방법: 바지 픽셀만 골라 색상(H)·채도(S)를 상의 값으로 바꾸고 명도(V)는 바지의 명암 분포를 상의의 명암 분포로 선형 변환한다(주름·입체감 유지).
 *  - 바지 "씨앗": 중간 톤 갈색(H 8~34°, S 0.35~0.62, V 0.48~0.77). 머리카락(V≤0.42)·피부(V≥0.78)·신발(어두움)·셔츠(S 낮음)는 씨앗이 아니다.
 *  - 씨앗에서 연결된 갈색 계열(H 6~36°, S≥0.2, V 0.22~0.78)로만 자라며(그늘·외곽선 포함) 씨앗에서 12px 이내로 제한.
 *    머리카락은 바지와 맞닿지 않아(사이에 셔츠) 번지지 않는다. 1~3행(캐릭터)만 처리, 4행(똥·표정)은 손대지 않는다. */
'use strict';
const fs = require('fs');
const path = require('path');
const png = require('./png');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'assets', '캐릭터 스프라이트 시트 PNG.png');
const OUT = path.join(ROOT, 'assets', '캐릭터 스프라이트 시트 PNG (바지 아이보리).png');
const ROWS_Y1 = 812; // 이 아래(4행)는 처리하지 않음

const img = png.decode(fs.readFileSync(SRC));
const W = img.width, H = img.height, D = img.data;

function rgb2hsv(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0; if (d > 0) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; } return [h, mx ? d / mx : 0, mx]; }
function hsv2rgb(h, s, v) { const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c; let r = 0, g = 0, b = 0; if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0]; else if (h < 180) [r, g, b] = [0, c, x]; else if (h < 240) [r, g, b] = [0, x, c]; else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x]; return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]; }

const SHIRT = { h: 27, sLit: 0.16, vLit: 0.97, vDark: 0.62 }; // 상의 실측: 밝은 면 (247,224,204) H27 S0.17 V0.97, 주름 그늘 V≈0.62·S≈0.45
const SHORTS = { vMin: 0.24, vMax: 0.78 };                       // 바지 실측: 중간 (168,121,92) V0.66, 그늘 ~0.3, 밝은 면 ~0.78

// 싸기2·3 프레임에 그려진 똥(발 앞, 주황갈색)은 재색상에서 제외 — 나중에 build-character 가 색으로 찾아 지운다
const EXCLUDE = [[860, 745, 935, 812], [1040, 745, 1125, 812]];
const excluded = (x, y) => EXCLUDE.some(b => x >= b[0] && x < b[2] && y >= b[1] && y < b[3]);

/* 머리카락 제외: 어두운 갈색(V≤0.46, S 0.12~0.42, H 6~34°)의 큰 연결요소(≥1200px)가 머리카락이다(신발·바지 그늘은 훨씬 작다).
 * 그 bbox 를 5px 넓혀 씨앗·후보 모두에서 제외 — 앞머리와 얼굴 경계의 중간색 픽셀이 바지로 오인되는 것을 막는다 */
const hairMask = new Uint8Array(W * H), hairBox = new Uint8Array(W * H);
for (let y = 0; y < ROWS_Y1; y++) for (let x = 0; x < W; x++) {
  const o = (y * W + x) * 4; if (D[o + 3] < 40) continue;
  const [h, s, v] = rgb2hsv(D[o], D[o + 1], D[o + 2]);
  if (h >= 6 && h <= 34 && s >= 0.12 && s <= 0.42 && v <= 0.46) hairMask[y * W + x] = 1;
}
{
  const seen = new Uint8Array(W * H); let blobs = 0;
  for (let i = 0; i < W * ROWS_Y1; i++) {
    if (!hairMask[i] || seen[i]) continue;
    const comp = [], stack = [i]; seen[i] = 1;
    while (stack.length) { const p = stack.pop(); comp.push(p); const px = p % W, py = (p / W) | 0;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const nx = px + dx, ny = py + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= ROWS_Y1) continue; const q = ny * W + nx; if (hairMask[q] && !seen[q]) { seen[q] = 1; stack.push(q); } } }
    if (comp.length < 1200) continue;
    blobs++;
    let x0 = W, y0 = H, x1 = -1, y1 = -1; comp.forEach(p => { const px = p % W, py = (p / W) | 0; if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; });
    for (let y = Math.max(0, y0 - 5); y <= Math.min(H - 1, y1 + 5); y++) for (let x = Math.max(0, x0 - 5); x <= Math.min(W - 1, x1 + 5); x++) hairBox[y * W + x] = 1;
  }
  console.log('머리카락 덩어리 ' + blobs + '개 제외');
}

const seed = new Uint8Array(W * H), cand = new Uint8Array(W * H);
for (let y = 0; y < ROWS_Y1; y++) for (let x = 0; x < W; x++) {
  const o = (y * W + x) * 4; if (D[o + 3] < 40 || excluded(x, y) || hairBox[y * W + x]) continue;
  const [h, s, v] = rgb2hsv(D[o], D[o + 1], D[o + 2]);
  const warm = h >= 4 && h <= 38;
  const sMin = v < 0.5 ? 0.1 : 0.2, sMax = v < 0.5 ? 0.8 : 0.6; // 깊은 주름 그늘은 채도가 낮기도(회갈색), 높기도(진갈색) 하다. 밝은 쪽은 똥(S≈0.65+) 제외
  if (warm && s >= sMin && s <= sMax && v >= 0.14 && v <= SHORTS.vMax) cand[y * W + x] = 1;
  if (warm && s >= 0.35 && s <= 0.58 && v >= 0.48 && v <= 0.77) seed[y * W + x] = 1;
}
// 씨앗에서 후보로 자라기(BFS, 거리 12px 제한)
const dist = new Int16Array(W * H).fill(-1);
let queue = [];
for (let i = 0; i < W * H; i++) if (seed[i]) { dist[i] = 0; queue.push(i); }
const MAXD = 12;
for (let qi = 0; qi < queue.length; qi++) {
  const p = queue[qi], d = dist[p]; if (d >= MAXD) continue;
  const x = p % W, y = (p / W) | 0;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= ROWS_Y1) continue;
    const q = ny * W + nx; if (dist[q] >= 0 || !cand[q]) continue;
    dist[q] = d + 1; queue.push(q);
  }
}
let n = 0;
const out = Buffer.from(D);
for (let i = 0; i < W * H; i++) {
  if (dist[i] < 0) continue;
  const o = i * 4;
  const [, , v] = rgb2hsv(D[o], D[o + 1], D[o + 2]);
  const t = Math.max(0, Math.min(1, (v - SHORTS.vMin) / (SHORTS.vMax - SHORTS.vMin)));
  const nv = Math.min(0.99, 0.60 + 0.45 * t);                        // 바지 중간 톤(t≈0.78) → 상의 밝은 면(0.95), 깊은 주름 → 0.60
  const ns = SHIRT.sLit + (SHIRT.vLit - nv) * 0.6;                   // 상의처럼 그늘일수록 채도가 조금 오른다
  const [r, g, b] = hsv2rgb(SHIRT.h, Math.min(0.45, ns), nv);
  out[o] = r; out[o + 1] = g; out[o + 2] = b; n++;
}
fs.writeFileSync(OUT, png.encode({ width: W, height: H, data: out }));
console.log('바지 픽셀 ' + n + '개 재색상 → ' + path.basename(OUT));
