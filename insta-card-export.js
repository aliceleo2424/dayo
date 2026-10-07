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

  var memoryLoader;
  function loadMemoryRenderer(){
    if(window.DayOMemoryCard)return Promise.resolve(window.DayOMemoryCard);
    if(!memoryLoader)memoryLoader=new Promise(function(resolve,reject){var script=document.createElement('script');script.src='/memory-card.js';script.onload=function(){window.DayOMemoryCard?resolve(window.DayOMemoryCard):reject(Error('renderer'));};script.onerror=function(){memoryLoader=null;reject(Error('renderer'));};document.head.appendChild(script);});return memoryLoader;
  }
  function memoryLocale(){return !(window.DayOI18n&&String(window.DayOI18n.getLang()).toLowerCase()==='en');}
  async function exportRenderedMemory(canvas,button){
    var original=button&&button.innerHTML,ko=memoryLocale();if(button){button.disabled=true;button.textContent=ko?'저장 중…':'Saving…';}
    try{var blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('png');var file=new File([blob],'DayO_Memory_'+Date.now()+'.png',{type:'image/png'});
      if(navigator.canShare&&navigator.canShare({files:[file]})){try{await navigator.share({files:[file],title:'DayO Memory Card'});return;}catch(error){if(error&&error.name==='AbortError')return;}}
      downloadPng(canvas);
    }catch(_){alert(ko?'대화 카드를 저장하지 못했어요. 다시 시도해 주세요.':'Could not save your Memory Card. Please try again.');}
    finally{restoreButton(button,original);}
  }
  async function previewMemoryCard(host,button){
    var original=button&&button.innerHTML,ko=memoryLocale();if(document.querySelector('dialog.dayo-memory-preview'))return;
    if(button){button.disabled=true;button.textContent=ko?'카드 준비 중…':'Preparing your card…';}
    try{var model=JSON.parse(decodeURIComponent(host.getAttribute('data-memory-card'))),renderer=await loadMemoryRenderer(),canvas=await renderer.render(model);
      if(document.querySelector('dialog.dayo-memory-preview'))return;
      if(!document.getElementById('dayo-memory-preview-css')){var css=document.createElement('style');css.id='dayo-memory-preview-css';css.textContent='.dayo-memory-preview{box-sizing:border-box;width:calc(100% - 32px);max-width:540px;max-height:calc(100dvh - 32px);padding:16px;border:1px solid #e8dfd1;border-radius:16px;background:#FFFBF4;color:#51433c;overflow:auto}.dayo-memory-preview::backdrop{background:rgba(41,47,38,.45)}.dayo-memory-preview h2{font:600 18px/1.4 sans-serif;margin:0 0 12px}.dayo-memory-preview canvas{display:block;width:100%;height:auto}.dayo-memory-preview-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;position:sticky;bottom:-16px;margin-top:12px;padding:12px 0;background:#FFFBF4}.dayo-memory-preview-actions button{min-width:0;min-height:44px;border-radius:10px;padding:8px 12px;font:600 14px/1.4 sans-serif;border:1px solid #5F7D63;color:#5F7D63;background:#FFFBF4}.dayo-memory-preview-actions button:last-child{color:white;background:#5F7D63}.ucr-memory-action{margin:16px 0}';document.head.appendChild(css);}
      var dialog=document.createElement('dialog'),heading=document.createElement('h2'),actions=document.createElement('div'),close=document.createElement('button'),save=document.createElement('button');dialog.className='dayo-memory-preview';heading.id='dayo-memory-preview-title';heading.textContent=ko?'대화 카드 미리보기':'Memory Card preview';dialog.setAttribute('aria-labelledby',heading.id);actions.className='dayo-memory-preview-actions';close.type=save.type='button';close.textContent=ko?'닫기':'Close';save.textContent=ko?'저장':'Save';close.onclick=()=>dialog.close();save.onclick=()=>exportRenderedMemory(canvas,save);actions.append(close,save);dialog.append(heading,canvas,actions);document.body.append(dialog);dialog.addEventListener('close',()=>{dialog.remove();if(button&&document.contains(button))button.focus();},{once:true});dialog.showModal();close.focus();
    }catch(_){alert(ko?'대화 카드를 준비하지 못했어요. 다시 시도해 주세요.':'Could not prepare your Memory Card. Please try again.');}
    finally{restoreButton(button,original);}
  }

  window.saveInstaCard = async function (event) {
    var trigger = (event && (event.currentTarget || event.target)) || document.getElementById('btn-save-card');
    if (trigger && trigger.closest) {
      var maybeBtn = trigger.closest('#btn-save-card, .btn-save-card, button');
      if (maybeBtn) trigger = maybeBtn;
    }

    var memoryHost = trigger&&trigger.closest&&trigger.closest('[data-memory-card]');
    if(!memoryHost&&trigger&&trigger.closest){var localWrap=trigger.closest('.insta-card-export-wrap');memoryHost=localWrap&&localWrap.querySelector('[data-memory-card]');}
    if(memoryHost){await previewMemoryCard(memoryHost,trigger&&trigger.tagName==='BUTTON'?trigger:null);return;}

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
