/* 똥으로 그리세요 — 저장 이미지(1080×1920, 흰 배경) + 저장/공유.
 * 구성: 작품(가장 크게, 중앙) · 상단 게임명(작게) · 하단 "💩 총 N번 · ⏱ 시간" · @ccojik.dh
 * 저장 순서: 터치 기기에서 파일 공유(navigator.share) 가능 → 공유 시트("이미지 저장")
 *            → 아니면 a[download] 다운로드. 둘 다 안 되는 환경(인스타그램 인앱 브라우저 등)을 위해
 *            호출부(main.js)가 결과 이미지를 화면에 띄워 길게 눌러 저장할 수 있게 한다.
 * 외부 이미지가 없어 캔버스 오염 문제가 없다. 공유는 사용자 제스처 안에서 끝나야 하므로
 * toBlob(비동기) 대신 toDataURL(동기)로 Blob을 만든다. */
'use strict';
window.PD = window.PD || {};

PD.export = (function () {
  const C = PD.CONFIG;

  function formatTime(sec) {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h) return h + '시간 ' + m + '분';
    if (m) return m + '분 ' + s + '초';
    return s + '초';
  }
  function formatDistance(units) {
    return Math.round(units * C.METERS_PER_UNIT) + 'm';
  }

  function buildImage(snap) {
    const W = C.EXPORT_W, H = C.EXPORT_H;
    const cnv = document.createElement('canvas');
    cnv.width = W; cnv.height = H;
    const ctx = cnv.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);

    // 작품 — 플레이 결과 그대로(재정렬 없음), 영역 안에 여백을 두고 맞춤
    const fit = PD.camera.fitRect(PD.world.bounds(), C.EXPORT_ART, C.EXPORT_MAX_SCALE);
    const poops = snap.poops;
    for (let i = 0; i < poops.length; i++) {
      const p = poops[i];
      PD.renderer.drawPoop(ctx, p.x * fit.scale + fit.ox, p.y * fit.scale + fit.oy, fit.scale, 1, 1, 1, p.v);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#000000';
    ctx.font = '800 54px ' + PD.FONT;
    ctx.fillText(C.TITLE, W / 2, 168);

    // "총 N번 쌌어요" — 똥 글자 대신 1번 에셋 아이콘을 글자 왼쪽에 그린다(스프라이트 로드 전이면 아이콘 생략)
    ctx.fillStyle = '#000000';
    ctx.font = '800 44px ' + PD.FONT;
    const countText = '총 ' + snap.stats.poops + '번 쌌어요';
    const iconW = 52, gap = 12;
    const sp = PD.sprites && PD.sprites.get(C.POOP_VARIANTS[0].id) ? PD.renderer.poopSprite(iconW / C.POOP_SIZE, 0) : null;
    const textW = ctx.measureText(countText).width;
    if (sp) {
      const iw = sp.w, ih = sp.h;
      const x0 = W / 2 - (iw + gap + textW) / 2;
      ctx.drawImage(sp.canvas, x0, 1690 - ih * 0.78, iw, ih);
      ctx.textAlign = 'left';
      ctx.fillText(countText, x0 + iw + gap, 1690);
      ctx.textAlign = 'center';
    } else {
      ctx.fillText(countText, W / 2, 1690);
    }
    ctx.fillStyle = '#777777';
    ctx.font = '600 34px ' + PD.FONT;
    ctx.fillText('⏱ ' + formatTime(snap.stats.playTime) + ' 걸렸어요', W / 2, 1748);

    ctx.fillStyle = '#000000';
    ctx.font = '700 36px ' + PD.FONT;
    ctx.fillText(C.HANDLE, W / 2, 1830);
    return cnv;
  }

  function dataUrlToBlob(url) {
    const b64 = url.split(',')[1];
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: 'image/png' });
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /* → { status: 'shared' | 'aborted' | 'saved' | 'failed', dataUrl } */
  async function save(canvas, filename) {
    const dataUrl = canvas.toDataURL('image/png');
    const blob = dataUrlToBlob(dataUrl);
    const isTouch = document.body.classList.contains('touch');
    if (isTouch && navigator.canShare && typeof File === 'function') {
      try {
        const file = new File([blob], filename, { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: C.TITLE });
          return { status: 'shared', dataUrl };
        }
      } catch (e) {
        if (e && e.name === 'AbortError') return { status: 'aborted', dataUrl };
        // 그 외 실패는 다운로드로 폴백
      }
    }
    try {
      download(blob, filename);
      return { status: 'saved', dataUrl };
    } catch (_) {
      return { status: 'failed', dataUrl };
    }
  }

  function filename(snap) {
    return 'poop-draw-' + snap.stats.poops + '.png';
  }

  return { buildImage, save, filename, formatTime, formatDistance };
})();
