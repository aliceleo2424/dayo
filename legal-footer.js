/* DayO PG-compliant legal footer — inject on marketing pages */
(function () {
  'use strict';

  function shouldSkip() {
    if (document.body && document.body.classList.contains('is-room')) return true;
    var path = String(window.location.pathname || '');
    if (/room\.html$/i.test(path) || /\/room\/?$/i.test(path)) return true;
    return false;
  }

  function ensureStyles() {
    if (document.getElementById('dayo-legal-footer-style')) return;
    var style = document.createElement('style');
    style.id = 'dayo-legal-footer-style';
    style.textContent = [
      '.dayo-legal-footer{background:#FAF8F5;border-top:1px solid #EDE4D5;padding:36px 20px;color:#78716C;font-size:12px;line-height:1.7;text-align:center;}',
      '.dayo-legal-footer a{color:#57534E;font-weight:700;text-decoration:none;}',
      '.dayo-legal-footer a:hover{text-decoration:underline;color:#E85B48;}',
      '.dayo-legal-footer__links{display:flex;flex-wrap:wrap;justify-content:center;gap:8px 10px;margin:0 0 16px;font-size:12px;}',
      '.dayo-legal-footer__sep{color:#D6D3D1;user-select:none;}',
      '.dayo-legal-footer__biz{max-width:920px;margin:0 auto 14px;display:grid;gap:4px;}',
      '.dayo-legal-footer__biz p{margin:0;}',
      '@media (max-width:640px){.dayo-legal-footer{padding:28px 16px;text-align:left;}.dayo-legal-footer__links{justify-content:flex-start;}}'
    ].join('');
    document.head.appendChild(style);
  }

  function currentLang() {
    // Explicit legal links take priority without changing the user's saved locale.
    if (document.body && document.body.classList.contains('legal-page')) {
      var requested = new URLSearchParams(window.location.search).get('lang');
      if (requested && /^(en|ko)$/i.test(requested)) return requested.toLowerCase();
    }
    var value = 'ko';
    try {
      value = window.DayOI18n && typeof window.DayOI18n.getLang === 'function'
        ? window.DayOI18n.getLang()
        : window.localStorage.getItem('dayo_lang');
    } catch (error) { /* keep Korean default */ }
    return String(value || '').toLowerCase() === 'en' ? 'en' : 'ko';
  }

  function copyFor(lang) {
    if (lang === 'en') {
      return {
        nav: 'Terms and policies', terms: 'Terms of Service', privacy: 'Privacy Policy', refund: 'Cancellation and Refund Policy',
        service: 'Service', business: 'Business name', representative: 'Representative', registration: 'Business Registration No.',
        address: 'Address', mailOrder: 'Mail-order business registration No.', mailOrderNumber: '제2026-서울강동-1580호',
        email: 'Customer support email', phone: 'Customer support phone', live: 'Live support', liveChannel: 'KakaoTalk Channel', hosting: 'Hosting service provider'
      };
    }
    return {
      nav: '약관 및 정책', terms: '이용약관', privacy: '개인정보처리방침', refund: '취소 및 환불규정',
      service: '서비스명', business: '상호', representative: '대표자', registration: '사업자등록번호',
      address: '사업장 소재지', mailOrder: '통신판매업 신고번호', mailOrderNumber: '제2026-서울강동-1580호',
      email: '고객센터 이메일', phone: '고객센터 전화', live: '실시간 상담', liveChannel: '카카오톡 채널', hosting: '호스팅 서비스 제공자'
    };
  }

  function footerHtml(lang) {
    var copy = copyFor(lang);
    var legalQuery = lang === 'en' ? '?lang=en' : '';
    return [
      '<footer class="dayo-legal-footer" role="contentinfo">',
      '  <nav class="dayo-legal-footer__links" aria-label="' + copy.nav + '">',
      '    <a href="/terms' + legalQuery + '">' + copy.terms + '</a>',
      '    <span class="dayo-legal-footer__sep" aria-hidden="true">|</span>',
      '    <a href="/privacy' + legalQuery + '">' + copy.privacy + '</a>',
      '    <span class="dayo-legal-footer__sep" aria-hidden="true">|</span>',
      '    <a href="/refund' + legalQuery + '">' + copy.refund + '</a>',
      '  </nav>',
      '  <div class="dayo-legal-footer__biz">',
      '    <p>' + copy.service + ': DayO(돼요) | ' + copy.business + ': 88드래곤즈 | ' + copy.representative + ': 여승현</p>',
      '    <p>' + copy.registration + ': 687-79-00609</p>',
      '    <p>' + copy.address + ': 서울특별시 강동구 고덕로 262, 720호<br>(명일동, 고덕역효성해링턴타워 더퍼스트)</p>',
      '    <p>' + copy.mailOrder + ': ' + copy.mailOrderNumber + '</p>',
      '    <p>' + copy.email + ': <a href="mailto:hello@dayotalk.com">hello@dayotalk.com</a></p>',
      '    <p>' + copy.phone + ': <a href="tel:07080951988">070-8095-1988</a></p>',
      '    <p>' + copy.live + ': ' + copy.liveChannel + ' ‘DayO 돼요’</p>',
      '    <p>' + copy.hosting + ': Vercel Inc.</p>',
      '  </div>',
      '</footer>'
    ].join('');
  }

  function applyLegalPageLanguage(lang) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-legal-lang]'), function (node) {
      node.hidden = node.getAttribute('data-legal-lang') !== lang;
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-legal-aria-ko]'), function (node) {
      node.setAttribute('aria-label', node.getAttribute(lang === 'en' ? 'data-legal-aria-en' : 'data-legal-aria-ko'));
    });
    if (!document.body || !document.body.classList.contains('legal-page')) return;
    document.documentElement.lang = lang;
    // Keep related legal-document navigation in the explicitly selected language.
    Array.prototype.forEach.call(document.querySelectorAll('a[href]'), function (node) {
      var url = new URL(node.getAttribute('href'), window.location.href);
      if (url.origin === window.location.origin && /^\/(privacy|terms|refund)(\.html)?\/?$/.test(url.pathname)) {
        url.searchParams.set('lang', lang);
        node.setAttribute('href', url.pathname + url.search + url.hash);
      }
    });
    var title = document.body.getAttribute(lang === 'en' ? 'data-legal-title-en' : 'data-legal-title-ko');
    var description = document.body.getAttribute(lang === 'en' ? 'data-legal-description-en' : 'data-legal-description-ko');
    if (title) document.title = title;
    var meta = document.querySelector('meta[name="description"]');
    if (meta && description) meta.setAttribute('content', description);
  }

  function mount() {
    if (shouldSkip()) return;
    ensureStyles();
    var lang = currentLang();
    applyLegalPageLanguage(lang);
    var existing = document.querySelector('.dayo-legal-footer');
    if (existing) {
      existing.outerHTML = footerHtml(lang);
      return;
    }
    var root = document.getElementById('dayo-legal-footer-root');
    if (root) {
      root.innerHTML = footerHtml(lang);
      return;
    }
    var old = document.querySelector('footer.site-footer');
    if (old) {
      old.outerHTML = footerHtml(lang);
      return;
    }
    document.body.insertAdjacentHTML('beforeend', footerHtml(lang));
  }

  document.addEventListener('dayo:langchange', mount);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
