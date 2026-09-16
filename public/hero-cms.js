/* Public hero CMS binding with a no-flash hardcoded fallback. */
(function () {
  'use strict';

  function safeText(value, fallback) {
    var text = String(value == null ? '' : value).trim();
    return text || fallback;
  }

  function safeLink(value, fallback) {
    var link = String(value == null ? '' : value).trim();
    if (!link) return fallback;
    if (link.charAt(0) === '#' || link.charAt(0) === '/' || /^https?:\/\//i.test(link)) return link;
    return fallback;
  }

  function safeImage(value) {
    var url = String(value == null ? '' : value).trim();
    return /^https?:\/\//i.test(url) ? url : '';
  }

  function bindCopy(settings) {
    var title = document.querySelector('[data-landing-hero] .hero-title');
    var subtitle = document.querySelector('[data-landing-hero] .hero-subtitle');
    var primary = document.getElementById('scrollToTopicsBtn');
    var secondary = document.getElementById('startQuizBtn');
    if (title) {
      title.textContent = safeText(settings.title, title.textContent);
      title.removeAttribute('data-i18n');
    }
    if (subtitle) {
      subtitle.textContent = safeText(settings.subtitle, subtitle.textContent);
      subtitle.removeAttribute('data-i18n');
    }
    if (primary) {
      primary.textContent = safeText(settings.primary_cta_text, primary.textContent);
      primary.setAttribute('href', safeLink(settings.primary_cta_link, '#topics'));
      primary.removeAttribute('data-i18n');
    }
    if (secondary) {
      secondary.textContent = safeText(settings.secondary_cta_text, secondary.textContent);
      secondary.setAttribute('href', safeLink(settings.secondary_cta_link, '#quiz'));
      secondary.removeAttribute('data-i18n');
    }
  }

  function bindRollingCards(settings) {
    var cards = Array.isArray(settings.rolling_cards)
      ? settings.rolling_cards.filter(function (card) { return card && safeImage(card.image_url); })
      : [];

    var heroVisual = document.querySelector('[data-landing-hero] .hero-visual');
    if (!cards.length) return false;

    if (heroVisual) heroVisual.hidden = false;
    var visualCard = heroVisual && heroVisual.querySelector('.visual-card');
    var badge = visualCard && visualCard.querySelector('.live-badge');
    var avatar = document.getElementById('partnerAvatar');
    var name = document.getElementById('partnerName');
    var greeting = document.getElementById('partnerGreeting');
    if (!visualCard || !badge || !avatar || !name || !greeting) return false;

    var index = 0;
    var paused = false;
    var switching = false;

    function render(card) {
      badge.textContent = safeText(card.tag, 'AI 코파일럿 실시간 지원 중');
      badge.removeAttribute('data-i18n');
      var partner = safeText(card.partner_name, 'DayO Partner');
      var country = String(card.country || '').trim();
      name.textContent = country ? partner + ' from ' + country : partner;
      greeting.textContent = safeText(card.speech_bubble, '반가워요! 오늘도 편하게 이야기해요 ☕');
      var imageUrl = safeImage(card.image_url);
      if (imageUrl) {
        avatar.innerHTML = '';
        var image = document.createElement('img');
        image.src = imageUrl;
        image.alt = partner + (country ? ' from ' + country : '');
        image.loading = 'eager';
        image.referrerPolicy = 'no-referrer';
        image.addEventListener('error', function () {
          avatar.innerHTML = '';
          avatar.textContent = partner.charAt(0).toUpperCase() || '☕';
          avatar.classList.add('cms-avatar-fallback');
        });
        avatar.classList.remove('cms-avatar-fallback');
        avatar.appendChild(image);
      } else {
        avatar.innerHTML = '';
        avatar.textContent = partner.charAt(0).toUpperCase() || '☕';
        avatar.classList.add('cms-avatar-fallback');
      }
      avatar.setAttribute('aria-label', name.textContent);
    }

    function next() {
      if (paused || switching || cards.length < 2) return;
      switching = true;
      visualCard.classList.add('cms-fade');
      setTimeout(function () {
        index = (index + 1) % cards.length;
        render(cards[index]);
        visualCard.classList.remove('cms-fade');
        switching = false;
      }, 500);
    }

    render(cards[index]);
    visualCard.addEventListener('mouseenter', function () { paused = true; });
    visualCard.addEventListener('mouseleave', function () { paused = false; });
    setInterval(next, 3500);
    return true;
  }

  async function loadHeroSettings() {
    var db = window.supabaseClient;
    if (!db) return;
    try {
      var result = await db
        .from('site_settings')
        .select('value, updated_at')
        .eq('key', 'hero_section')
        .maybeSingle();
      if (result.error || !result.data || !result.data.value) return;
      bindCopy(result.data.value);
      window.__dayoCmsHeroActive = bindRollingCards(result.data.value);
    } catch (error) {
      console.warn('[DayO CMS] hero fallback retained', error);
    }
  }

  function subscribeToHeroChanges() {
    var db = window.supabaseClient;
    if (!db || typeof db.channel !== 'function') return;
    db.channel('public-hero-settings')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'site_settings',
        filter: 'key=eq.hero_section'
      }, function () {
        window.location.reload();
      })
      .subscribe();
  }

  loadHeroSettings().then(subscribeToHeroChanges);
})();
