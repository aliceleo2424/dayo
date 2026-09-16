/* DayO 라운지 — articles 발행글 그리드 (없으면 lounge_posts fallback)
 * 그리드 모드(#loungeDots 없음)에서는 슬라이드 초기화만 스킵합니다.
 */
(function () {
  'use strict';

  var INTERVAL_MS = 4000;
  var SWIPE_THRESHOLD = 40;

  function getLoungeClient() {
    if (window.supabaseClient && typeof window.supabaseClient.from === 'function') {
      return window.supabaseClient;
    }
    if (window.supabase && typeof window.supabase.from === 'function') {
      return window.supabase;
    }
    return null;
  }

  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function categoryLabel(post) {
    return String((post && (post.category || post.label)) || 'DayO 라운지').trim();
  }

  function postTitle(post) {
    return String((post && (post.title || post.headline)) || '').trim();
  }

  function postSummary(post) {
    return String((post && (post.summary || post.excerpt || post.body || post.content)) || '').trim();
  }

  function thumbUrl(post) {
    return String((post && (post.thumbnail_url || post.thumbnail || post.image_url)) || '').trim();
  }

  function readTimeLabel(post) {
    var value = post && (post.read_time != null ? post.read_time : post.reading_time);
    if (value == null || value === '') return '';
    if (typeof value === 'number' && Number.isFinite(value)) return value + '분 읽기';
    return String(value).trim();
  }

  function fallbackTips() {
    return [
      {
        label: '디저트 팁',
        title: '카페에서 자연스럽게 이어가는 한 줄',
        summary: '“This smells amazing — what’s your favorite here?” 향과 취향으로 대화를 열면 부담이 덜해요.'
      },
      {
        label: '실전 꿀팁',
        title: '말이 막혔을 때 쓰는 여유 문장',
        summary: '“Give me a second, I’m finding the word.” 한 템포 쉬어도 대화는 이어져요.'
      },
      {
        label: '문화 한 조각',
        title: '디저트로 알아보는 취향 비교',
        summary: '티라미수 vs 말차 케이크처럼 가벼운 취향 질문이면 서로 이야기가 금방 늘어요.'
      }
    ];
  }

  function renderEmpty(track) {
    renderPosts(track, fallbackTips());
  }

  function renderPosts(track, posts) {
    if (!posts || !posts.length) {
      renderEmpty(track);
      return;
    }

    track.innerHTML = posts.map(function (post) {
      var label = categoryLabel(post);
      var title = postTitle(post);
      var summary = postSummary(post);
      var thumb = thumbUrl(post);
      var body = title || summary;
      var extra = (title && summary && summary !== title)
        ? '<span class="lounge-card__summary">' + esc(summary) + '</span>'
        : '';
      var meta = readTimeLabel(post);
      var metaHtml = meta ? '<span class="lounge-card__meta">' + esc(meta) + '</span>' : '';
      var thumbHtml = thumb
        ? '<img class="lounge-card__thumb" src="' + esc(thumb) + '" alt="" loading="lazy" onerror="this.remove()">'
        : '';
      return (
        '<article class="lounge-card" data-lounge-slide>' +
          thumbHtml +
          (label ? '<span class="lounge-card__label">' + esc(label) + '</span>' : '') +
          '<span class="lounge-card__body">' + esc(body) + '</span>' +
          extra +
          metaHtml +
        '</article>'
      );
    }).join('');
  }

  async function loadLoungePosts() {
    var track = document.getElementById('loungeTrack');
    if (!track) return;
    var supabase = getLoungeClient();
    if (!supabase) {
      renderEmpty(track);
      return;
    }

    try {
      var query = await supabase
        .from('articles')
        .select('*')
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .limit(4);
      if (query.error) {
        query = await supabase
          .from('lounge_posts')
          .select('*')
          .eq('is_published', true)
          .order('created_at', { ascending: false });
      }
      if (query.error) throw query.error;
      renderPosts(track, query.data);
    } catch (err) {
      console.warn('[DayO] lounge articles load failed', err);
      renderEmpty(track);
    }
  }

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

  function init() {
    loadLoungePosts().then(function () {
      initLoungeCarousel();
    });
    var supabase = getLoungeClient();
    if (supabase && typeof supabase.channel === 'function') {
      supabase.channel('mypage-published-articles')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'articles' }, function () {
          loadLoungePosts();
        })
        .subscribe();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
