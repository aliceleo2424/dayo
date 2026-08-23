(function checkInAppBrowser() {
  const userAgent = navigator.userAgent.toLowerCase();
  const targetUrl = window.location.href;

  // 카카오톡, 라인, 인스타그램 등 인앱 브라우저 감지
  const isInApp = /kakaotalk|line|inapp|naver|snapchat|instagram/i.test(userAgent);

  if (isInApp) {
    // 1) 안드로이드: 크롬 브라우저 자동 실행 (intent)
    if (/android/i.test(userAgent)) {
      const cleanUrl = targetUrl.replace(/https?:\/\//i, '');
      location.href = `intent://${cleanUrl}#Intent;scheme=https;package=com.android.chrome;end`;
      return;
    }

    // 2) iOS (아이폰): 사파리 전환 유도 오버레이 팝업 노출
    if (/iphone|ipad|ipod/i.test(userAgent)) {
      window.addEventListener('DOMContentLoaded', () => {
        const guideBanner = document.createElement('div');
        guideBanner.id = 'inapp-guide-banner';
        guideBanner.innerHTML = `
          <div style="position:fixed; top:0; left:0; width:100%; background:#635BFF; color:#fff; padding:12px 16px; font-size:13px; font-weight:600; text-align:center; z-index:99999; box-shadow:0 4px 12px rgba(0,0,0,0.15); display:flex; justify-content:space-between; align-items:center;">
            <span>🎙️ 원활한 마이크/AI 힌트 이용을 위해 <strong>우측 하단 [···] ➔ [Safari로 열기]</strong>를 눌러주세요!</span>
            <button onclick="this.parentElement.remove()" style="background:none; border:none; color:#fff; font-size:16px; cursor:pointer; margin-left:8px;">✕</button>
          </div>
        `;
        document.body.prepend(guideBanner);
      });
    }
  }
})();
