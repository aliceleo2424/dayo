/* DayO viral card export — retina html2canvas + mobile Web Share */
(function () {
  'use strict';

  if (!document.getElementById('insta-card-export-css')) {
    var style = document.createElement('style');
    style.id = 'insta-card-export-css';
    style.textContent = [
      '#insta-card-capture,',
      '.viral-card {',
      '  overflow: hidden !important;',
      '  box-sizing: border-box !important;',
      '}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function waitForCardAssets(cardElement) {
    var waits = [];
    if (document.fonts && document.fonts.ready) waits.push(document.fonts.ready.catch(function () {}));
    Array.prototype.forEach.call(cardElement.querySelectorAll('img'), function (img) {
      if (img.complete && img.naturalWidth) return;
      waits.push(new Promise(function (resolve) {
        var done = false;
        function finish() {
          if (done) return;
          done = true;
          resolve();
        }
        img.addEventListener('load', finish, { once: true });
        img.addEventListener('error', finish, { once: true });
        setTimeout(finish, 4000);
      }));
    });
    return Promise.all(waits);
  }

  function restoreButton(btn, originalBtnText) {
    if (!btn) return;
    btn.innerHTML = originalBtnText;
    btn.disabled = false;
  }

  function downloadPng(canvas) {
    var imageURL = canvas.toDataURL('image/png');
    var downloadLink = document.createElement('a');
    downloadLink.href = imageURL;
    downloadLink.download = 'DayO_Card_' + Date.now() + '.png';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  }

  window.saveInstaCard = async function (event) {
    var trigger = (event && (event.currentTarget || event.target)) || document.getElementById('btn-save-card');
    if (trigger && trigger.closest) {
      var maybeBtn = trigger.closest('#btn-save-card, .btn-save-card, button');
      if (maybeBtn) trigger = maybeBtn;
    }

    var wrap = trigger && trigger.closest ? trigger.closest('.insta-card-export-wrap') : null;
    var cardElement = (wrap && wrap.querySelector('#insta-card-capture, .viral-card'))
      || document.getElementById('insta-card-capture')
      || document.querySelector('.viral-card');
    var btn = (trigger && trigger.tagName === 'BUTTON') ? trigger : document.getElementById('btn-save-card');

    if (!cardElement) {
      alert('저장할 카드를 찾을 수 없습니다.');
      return;
    }

    if (typeof html2canvas !== 'function') {
      alert('이미지 저장 모듈을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }

    var originalBtnText = btn ? btn.innerHTML : '';
    if (btn) {
      btn.innerHTML = '⏳ 고화질 생성 중...';
      btn.disabled = true;
    }

    try {
      await waitForCardAssets(cardElement);

      var canvas = await html2canvas(cardElement, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: null
      });

      canvas.toBlob(async function (blob) {
        if (!blob) {
          alert('이미지 저장 중 오류가 발생했습니다. 다시 시도해 주세요.');
          restoreButton(btn, originalBtnText);
          return;
        }

        var file = new File([blob], 'DayO_Talk_' + Date.now() + '.png', { type: 'image/png' });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: 'DayO 실전 대화 리포트',
              text: '오늘 원어민 파트너와 나눈 1:1 실전 대화 카드!'
            });
            restoreButton(btn, originalBtnText);
            return;
          } catch (shareErr) {
            if (shareErr && shareErr.name === 'AbortError') {
              restoreButton(btn, originalBtnText);
              return;
            }
            console.warn('Share API failed, fallback to download', shareErr);
          }
        }

        downloadPng(canvas);
        if (btn) {
          btn.innerHTML = '✅ 저장 완료!';
          setTimeout(function () {
            restoreButton(btn, originalBtnText);
          }, 2000);
        }
      }, 'image/png');
    } catch (error) {
      console.error('카드 캡처 오류:', error);
      alert('이미지 저장 중 오류가 발생했습니다. 다시 시도해 주세요.');
      restoreButton(btn, originalBtnText);
    }
  };
})();
