/* DayO reviews — 3s auto-play carousel, pause on hover/touch */
(function () {
  'use strict';

  var INTERVAL_MS = 3000;
  var TRANSITION_MS = 400;
  var TRANSITION = 'transform 0.4s ease-in-out';

  function initReviewsCarousel() {
    var viewport = document.getElementById('reviewsCarousel');
    var track = document.getElementById('reviewsTrack');
    if (!viewport || !track) return;

    var cards = track.querySelectorAll('.review-card');
    if (cards.length < 2) return;

    Array.prototype.forEach.call(cards, function (card) {
      card.classList.add('visible');
    });

    var timer = null;
    var animating = false;
    var settleTimer = null;

    function getStepPx() {
      var card = track.querySelector('.review-card');
      var nextCard = card && card.nextElementSibling;
      if (card && nextCard) {
        return nextCard.offsetLeft - card.offsetLeft;
      }
      return card ? card.getBoundingClientRect().width : 0;
    }

    function resetTrack(animate) {
      track.style.transition = animate ? TRANSITION : 'none';
      track.style.transform = 'translateX(0)';
      if (!animate) {
        void track.offsetWidth;
        track.style.transition = TRANSITION;
      }
    }

    function recycleFrontCard() {
      var first = track.querySelector('.review-card');
      if (first) track.appendChild(first);
      resetTrack(false);
      animating = false;
    }

    function next() {
      if (animating) return;
      var step = getStepPx();
      if (step <= 0) return;

      animating = true;
      track.style.transition = TRANSITION;
      track.style.transform = 'translateX(-' + step + 'px)';

      var settled = false;
      function settle(event) {
        if (event && event.target !== track) return;
        if (event && event.propertyName && event.propertyName !== 'transform') return;
        if (settled) return;
        settled = true;
        track.removeEventListener('transitionend', settle);
        if (settleTimer) {
          clearTimeout(settleTimer);
          settleTimer = null;
        }
        recycleFrontCard();
      }

      track.addEventListener('transitionend', settle);
      settleTimer = setTimeout(settle, TRANSITION_MS + 80);
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

    window.addEventListener('resize', function () {
      if (settleTimer) {
        clearTimeout(settleTimer);
        settleTimer = null;
      }
      animating = false;
      resetTrack(false);
    });

    resetTrack(false);
    startAuto();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initReviewsCarousel);
  } else {
    initReviewsCarousel();
  }
})();
