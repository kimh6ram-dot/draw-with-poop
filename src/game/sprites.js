/* sprites-data.js(base64 내장 PNG)를 Image 객체로 로드. file://에서도 캔버스 오염 없이 그릴 수 있다(햄버거 쌓기 패턴).
 * PD.sprites.get('poop_1') → { img, w, h, bbox }. 로드 전에는 undefined → renderer 가 벡터 폴백으로 그린다.
 * onReady 는 load() 이후 등록해도 즉시 실행된다(loaded 플래그). */
'use strict';
window.PD = window.PD || {};

PD.sprites = (function () {
  const store = {};
  let loaded = false;
  const callbacks = [];

  function finish() {
    loaded = true;
    callbacks.splice(0).forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
  }

  function load(onDone) {
    if (onDone) callbacks.push(onDone);
    const data = window.PD_SPRITES || {};
    const ids = Object.keys(data);
    let remaining = ids.length;
    if (remaining === 0) { finish(); return; }
    ids.forEach(id => {
      const entry = data[id];
      const img = new Image();
      img.onload = () => {
        store[id] = { img, w: entry.w, h: entry.h, bbox: entry.bbox };
        if (--remaining === 0) finish();
      };
      img.onerror = () => {
        console.error('스프라이트 로드 실패: ' + id);
        if (--remaining === 0) finish();
      };
      img.src = entry.src;
    });
  }

  function onReady(fn) { if (loaded) fn(); else callbacks.push(fn); }
  function get(id) { return store[id]; }
  function isLoaded() { return loaded; }

  return { load, get, isLoaded, onReady };
})();
