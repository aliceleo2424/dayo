/* DayO shared scroll-lock — nested-safe lock/unlock with full style cleanup */
(function (window, document) {
  'use strict';

  var STYLE_PROPS = [
    'overflow', 'overflowX', 'overflowY',
    'position', 'top', 'left', 'right', 'bottom', 'width', 'height',
    'paddingRight', 'touchAction', 'overscrollBehavior', 'transform', 'pointerEvents'
  ];

  var count = 0;
  var snapshot = null;

  function readStyles(node) {
    var out = {};
    STYLE_PROPS.forEach(function (prop) {
      out[prop] = node.style[prop];
    });
    return out;
  }

  function writeStyles(node, styles) {
    STYLE_PROPS.forEach(function (prop) {
      node.style[prop] = (styles && styles[prop]) || '';
    });
  }

  function clearLockStyles(node) {
    STYLE_PROPS.forEach(function (prop) {
      node.style[prop] = '';
    });
  }

  function scrollbarGap() {
    return Math.max(0, window.innerWidth - document.documentElement.clientWidth);
  }

  function applyLock() {
    var html = document.documentElement;
    var body = document.body;
    if (!body) return;

    snapshot = {
      html: readStyles(html),
      body: readStyles(body),
      x: window.scrollX || window.pageXOffset || 0,
      y: window.scrollY || window.pageYOffset || 0
    };

    var gap = scrollbarGap();
    html.style.overflow = 'hidden';
    html.style.overflowX = 'hidden';
    html.style.overscrollBehavior = 'none';

    body.style.overflow = 'hidden';
    body.style.overflowX = 'hidden';
    body.style.overscrollBehavior = 'none';
    body.style.position = 'fixed';
    body.style.top = '-' + snapshot.y + 'px';
    body.style.left = '0px';
    body.style.right = '0px';
    body.style.width = '100%';
    body.style.maxWidth = '100%';
    body.style.transform = 'none';
    if (gap) body.style.paddingRight = gap + 'px';

    body.classList.add('dayo-scroll-locked');
    body.setAttribute('data-dayo-scroll-lock', '1');
  }

  function restore() {
    var html = document.documentElement;
    var body = document.body;
    var snap = snapshot;
    var x = snap ? snap.x : 0;
    var y = snap ? snap.y : 0;
    snapshot = null;
    count = 0;

    if (!body) return;

    if (snap) {
      writeStyles(html, snap.html);
      writeStyles(body, snap.body);
    } else {
      clearLockStyles(html);
      clearLockStyles(body);
    }

    body.style.maxWidth = '';
    body.classList.remove('dayo-scroll-locked');
    body.removeAttribute('data-dayo-scroll-lock');

    window.scrollTo(x, y);
    if ((window.scrollX || 0) !== 0) window.scrollTo(0, y);
  }

  function lock() {
    count += 1;
    if (count === 1) applyLock();
  }

  function unlock() {
    if (count === 0) {
      restore();
      return;
    }
    count -= 1;
    if (count === 0) restore();
  }

  function unlockAll() {
    restore();
  }

  window.DayOScrollLock = {
    lock: lock,
    unlock: unlock,
    unlockAll: unlockAll,
    reset: unlockAll
  };

  window.addEventListener('pageshow', function (event) {
    if (event.persisted) unlockAll();
  });
})(window, document);
