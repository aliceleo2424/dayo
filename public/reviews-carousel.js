/* DayO reviews — 3s auto-play carousel, pause on hover/touch */
(function () {
  'use strict';

  var INTERVAL_MS = 3000;
  var TRANSITION = 'transform 0.4s ease-in-out';

  function initReviewsCarousel() {
    var viewport = document.getElementById('reviewsCarousel');
    var track = document.getElementById('reviewsTrack');
    if (!viewport || !track) return;

    var cards = track.querySelectorAll('.review-card');
    if (cards.length < 2) return;

    var firstClone = cards[0].cloneNode(true);
    firstClone.setAttribute('aria-hidden', 'true');
    firstClone.classList.remove('reveal', 'reveal-delay-1', 'reveal-delay-2', 'reveal-delay-3', 'visible');
    firstClone.style.opacity = '1';
    firstClone.style.transform = '';
    track.appendChild(firstClone);

    var count = cards.length;
    var index = 0;
    var timer = null;
    var jumping = false;

    function applyTransform(i, animate) {
      track.style.transition = animate ? TRANSITION : 'none';
      track.style.transform = 'translateX(-' + i * 100 + '%)';
      if (!animate) {
        void track.offsetWidth;
        track.style.transition = TRANSITION;
      }
    }

    function next() {
      if (jumping) return;
      index += 1;
      applyTransform(index, true);
      if (index !== count) return;
      jumping = true;
      track.addEventListener('transitionend', function onEnd(event) {
        if (event.target !== track) return;
        if (event.propertyName && event.propertyName !== 'transform') return;
        track.removeEventListener('transitionend', onEnd);
        index = 0;
        applyTransform(0, false);
        jumping = false;
      });
    }

    function startAuto() {
      stopAuto();
      timer = setInterval(next, INTERVAL_MS);
    }

    function stopAuto() {
      if (timer) clearInterval(timer);
      timer = null;
    }

    viewport.addEventListener('mouseenter', stopAuto);
    viewport.addEventListener('mouseleave', startAuto);
    viewport.addEventListener('touchstart', stopAuto, { passive: true });
    viewport.addEventListener('touchend', startAuto);
    viewport.addEventListener('touchcancel', startAuto);

    applyTransform(0, false);
    startAuto();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initReviewsCarousel);
  } else {
    initReviewsCarousel();
  }
})();
