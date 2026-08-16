/* DayO 로그인 대시보드 — 라이브 파트너 언어 칩 드롭다운 */
(function () {
  'use strict';

  function initAuthLangChip() {
    var chip = document.getElementById('authLangChip');
    var btn = document.getElementById('authLangChipBtn');
    var label = document.getElementById('authLangChipLabel');
    var menu = document.getElementById('authLangChipMenu');
    if (!chip || !btn || !label || !menu) return;

    function setOpen(open) {
      chip.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      setOpen(!chip.classList.contains('is-open'));
    });

    menu.addEventListener('click', function (e) {
      var opt = e.target.closest('[data-live-lang]');
      if (!opt) return;
      var value = opt.getAttribute('data-live-lang');
      label.textContent = value;
      Array.prototype.forEach.call(menu.querySelectorAll('[data-live-lang]'), function (el) {
        var active = el === opt;
        el.classList.toggle('is-active', active);
        el.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      setOpen(false);
    });

    document.addEventListener('click', function (e) {
      if (!chip.contains(e.target)) setOpen(false);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setOpen(false);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuthLangChip);
  } else {
    initAuthLangChip();
  }
})();
