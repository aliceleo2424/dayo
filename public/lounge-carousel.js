/* DayO 라운지 — 로그인 홈 그리드 카드 (캐러셀 슬롯은 선택)
 * 그리드 모드(#loungeDots 없음)에서는 초기화만 스킵합니다.
 */
(function () {
  'use strict';

  var INTERVAL_MS = 4000;
  var SWIPE_THRESHOLD = 40;

  function initLoungeCarousel() {
    var root = document.getElementById('loungeCarousel');
    var track = document.getElementById('loungeTrack');
    var dotsWrap = document.getElementById('loungeDots');
    if (!root || !track) return;

    // 그리드 카드 레이아웃이면 자동 슬라이드 불필요
    if (!dotsWrap || track.classList.contains('lounge-grid')) return;

    var slides = track.querySelectorAll('[data-lounge-slide]');
    if (!slides.length) return;

    var index = 0;
    var timer = null;
    var startX = 0;
    var deltaX = 0;
    var dragging = false;

    function goTo(next) {
      index = (next + slides.length) % slides.length;
      track.style.transform = 'translateX(-' + index * 100 + '%)';
      Array.prototype.forEach.call(dotsWrap.children, function (dot, i) {
        dot.classList.toggle('is-active', i === index);
        dot.setAttribute('aria-selected', i === index ? 'true' : 'false');
      });
    }

    function next() { goTo(index + 1); }
    function prev() { goTo(index - 1); }

    function startAuto() {
      stopAuto();
      timer = setInterval(next, INTERVAL_MS);
    }

    function stopAuto() {
      if (timer) clearInterval(timer);
      timer = null;
    }

    dotsWrap.innerHTML = '';
    Array.prototype.forEach.call(slides, function (_, i) {
      var dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'lounge-dot' + (i === 0 ? ' is-active' : '');
      dot.setAttribute('role', 'tab');
      dot.setAttribute('aria-label', '슬라이드 ' + (i + 1));
      dot.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
      dot.addEventListener('click', function () {
        goTo(i);
        startAuto();
      });
      dotsWrap.appendChild(dot);
    });

    goTo(0);
    startAuto();

    root.addEventListener('mouseenter', stopAuto);
    root.addEventListener('mouseleave', startAuto);
    root.addEventListener('focusin', stopAuto);
    root.addEventListener('focusout', startAuto);

    function onPointerDown(clientX) {
      dragging = true;
      startX = clientX;
      deltaX = 0;
      stopAuto();
    }

    function onPointerMove(clientX) {
      if (!dragging) return;
      deltaX = clientX - startX;
    }

    function onPointerUp() {
      if (!dragging) return;
      dragging = false;
      if (deltaX <= -SWIPE_THRESHOLD) next();
      else if (deltaX >= SWIPE_THRESHOLD) prev();
      startAuto();
    }

    root.addEventListener('touchstart', function (e) {
      if (!e.touches || !e.touches.length) return;
      onPointerDown(e.touches[0].clientX);
    }, { passive: true });

    root.addEventListener('touchmove', function (e) {
      if (!e.touches || !e.touches.length) return;
      onPointerMove(e.touches[0].clientX);
    }, { passive: true });

    root.addEventListener('touchend', onPointerUp);
    root.addEventListener('touchcancel', onPointerUp);

    var mouseDown = false;
    root.addEventListener('mousedown', function (e) {
      mouseDown = true;
      onPointerDown(e.clientX);
    });
    window.addEventListener('mousemove', function (e) {
      if (!mouseDown) return;
      onPointerMove(e.clientX);
    });
    window.addEventListener('mouseup', function () {
      if (!mouseDown) return;
      mouseDown = false;
      onPointerUp();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLoungeCarousel);
  } else {
    initLoungeCarousel();
  }
})();
