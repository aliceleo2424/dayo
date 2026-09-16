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

  function bindBanner(settings) {
    var banner = document.getElementById('cmsAnnouncement');
    var link = document.getElementById('cmsAnnouncementLink');
    if (banner && link) {
      var enabled = settings.enabled === true || settings.is_active === true;
      var text = String(settings.text || '').trim();
      banner.hidden = !(enabled && text);
      link.textContent = text;
      link.setAttribute('href', safeLink(settings.link, '#'));
    }

    if (!settings.popup_enabled || (!settings.popup_title && !settings.popup_content && !safeImage(settings.popup_image_url))) return;
    if (document.getElementById('cmsManagedPopup')) return;
    var overlay = document.createElement('div');
    overlay.id = 'cmsManagedPopup';
    overlay.className = 'cms-popup-overlay';
    var popup = document.createElement('div');
    popup.className = 'cms-popup';
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'cms-popup__close';
    close.setAttribute('aria-label', '팝업 닫기');
    close.textContent = '✕';
    close.addEventListener('click', function () { overlay.remove(); });
    popup.appendChild(close);
    var imageUrl = safeImage(settings.popup_image_url);
    if (imageUrl) {
      var image = document.createElement('img');
      image.src = imageUrl;
      image.alt = '';
      popup.appendChild(image);
    }
    var body = document.createElement('div');
    body.className = 'cms-popup__body';
    if (settings.popup_title) {
      var title = document.createElement('h2');
      title.textContent = String(settings.popup_title);
      body.appendChild(title);
    }
    if (settings.popup_content) {
      var content = document.createElement('p');
      content.textContent = String(settings.popup_content);
      body.appendChild(content);
    }
    popup.appendChild(body);
    overlay.appendChild(popup);
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  }

  function bindMagazine(value) {
    var posts = Array.isArray(value) ? value : (value && Array.isArray(value.posts) ? value.posts : []);
    posts = posts.filter(function (post) { return post && post.is_active !== false && String(post.title || '').trim(); }).slice(0, 4);
    var grid = document.getElementById('cmsMagazineGrid');
    if (!grid || !posts.length) return;
    grid.innerHTML = '';
    posts.forEach(function (post) {
      var card = document.createElement('a');
      card.className = 'cms-magazine-card visible';
      card.href = safeLink(post.link, '#magazine');
      var imageUrl = safeImage(post.thumbnail_url);
      if (imageUrl) {
        var image = document.createElement('img');
        image.src = imageUrl;
        image.alt = '';
        image.loading = 'lazy';
        card.appendChild(image);
      }
      var body = document.createElement('div');
      body.className = 'cms-magazine-card__body';
      var tag = document.createElement('span');
      tag.className = 'cms-magazine-card__tag';
      tag.textContent = safeText(post.category, 'Magazine');
      var title = document.createElement('h3');
      title.textContent = String(post.title);
      var summary = document.createElement('p');
      summary.textContent = String(post.summary || '');
      body.appendChild(tag);
      body.appendChild(title);
      if (summary.textContent) body.appendChild(summary);
      card.appendChild(body);
      grid.appendChild(card);
    });
  }

  function bindReviews(value) {
    var reviews = Array.isArray(value) ? value : (value && Array.isArray(value.reviews) ? value.reviews : []);
    reviews = reviews.filter(function (review) { return review && review.is_active !== false && String(review.quote || '').trim(); });
    var track = document.getElementById('reviewsTrack');
    if (!track || !reviews.length) return;
    track.innerHTML = '';
    reviews.forEach(function (review) {
      var card = document.createElement('article');
      card.className = 'review-card visible';
      var emoji = document.createElement('div');
      emoji.className = 'review-emoji';
      emoji.textContent = safeText(review.emoji, '☕');
      var quote = document.createElement('p');
      quote.className = 'review-text';
      quote.textContent = '“' + String(review.quote) + '”';
      var author = document.createElement('span');
      author.className = 'review-author';
      author.textContent = '— ' + [review.tag, review.author].filter(Boolean).join(' · ');
      card.appendChild(emoji);
      card.appendChild(quote);
      card.appendChild(author);
      track.appendChild(card);
    });
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

  async function fetchAllSettings() {
    var db = window.supabaseClient;
    var keys = ['banner_popup', 'hero_section', 'magazine_posts', 'real_reviews'];
    var env = window.__DAYO_ENV__ || {};
    var url = String(env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
    var anonKey = String(env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '');
    if (url && anonKey) {
      try {
        var endpoint = url + '/rest/v1/site_settings?select=key,value,updated_at&key=in.(' + keys.join(',') + ')';
        var response = await fetch(endpoint, {
          method: 'GET',
          cache: 'no-store',
          headers: {
            apikey: anonKey,
            Authorization: 'Bearer ' + anonKey
          }
        });
        if (!response.ok) throw new Error('CMS fetch failed: ' + response.status);
        return await response.json();
      } catch (fetchError) {
        console.warn('[DayO CMS] no-store fetch fallback', fetchError);
      }
    }
    if (!db) return [];
    var result = await db.from('site_settings').select('key, value, updated_at').in('key', keys);
    if (result.error) throw result.error;
    return result.data || [];
  }

  async function loadAllSettings() {
    try {
      var rows = await fetchAllSettings();
      var settings = {};
      rows.forEach(function (row) { settings[row.key] = row.value; });
      if (settings.banner_popup) bindBanner(settings.banner_popup);
      if (settings.hero_section) {
        bindCopy(settings.hero_section);
        window.__dayoCmsHeroActive = bindRollingCards(settings.hero_section);
      }
      if (settings.magazine_posts) bindMagazine(settings.magazine_posts);
      if (settings.real_reviews) bindReviews(settings.real_reviews);
    } catch (error) {
      console.warn('[DayO CMS] static fallbacks retained', error);
    }
  }

  function subscribeToHeroChanges() {
    var db = window.supabaseClient;
    if (!db || typeof db.channel !== 'function') return;
    db.channel('public-hero-settings')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'site_settings'
      }, function () {
        window.location.reload();
      })
      .subscribe();
  }

  loadAllSettings().then(subscribeToHeroChanges);
})();
