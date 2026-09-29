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

  function footerHtml() {
    return [
      '<footer class="dayo-legal-footer" role="contentinfo">',
      '  <nav class="dayo-legal-footer__links" aria-label="약관 및 정책">',
      '    <a href="/terms">이용약관</a>',
      '    <span class="dayo-legal-footer__sep" aria-hidden="true">|</span>',
      '    <a href="/privacy">개인정보처리방침</a>',
      '    <span class="dayo-legal-footer__sep" aria-hidden="true">|</span>',
      '    <a href="/refund">취소 및 환불규정</a>',
      '  </nav>',
      '  <div class="dayo-legal-footer__biz">',
      '    <p>서비스명: DayO(돼요) | 상호: 88드래곤즈 | 대표자: 여승현</p>',
      '    <p>사업자등록번호: 687-79-00609</p>',
      '    <p>사업장 소재지: 서울특별시 강동구 고덕로 262, 720호<br>(명일동, 고덕역효성해링턴타워 더퍼스트)</p>',
      '    <p>통신판매업신고번호: 신고 준비 중</p>',
      '    <p>고객센터 이메일: <a href="mailto:dayo.speak@gmail.com">dayo.speak@gmail.com</a></p>',
      '    <p>고객센터 전화: <a href="tel:07080951988">070-8095-1988</a></p>',
      '    <p>실시간 상담: 카카오톡 채널 ‘DayO 돼요’</p>',
      '    <p>호스팅 서비스 제공자: Vercel Inc.</p>',
      '  </div>',
      '</footer>'
    ].join('');
  }

  function mount() {
    if (shouldSkip()) return;
    if (document.querySelector('.dayo-legal-footer')) return;
    ensureStyles();
    var root = document.getElementById('dayo-legal-footer-root');
    if (root) {
      root.innerHTML = footerHtml();
      return;
    }
    var old = document.querySelector('footer.site-footer');
    if (old) {
      old.outerHTML = footerHtml();
      return;
    }
    document.body.insertAdjacentHTML('beforeend', footerHtml());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
