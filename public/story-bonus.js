/* DayO learner-only story card inside the post-session recap.
 *
 * Load after the room's inline openQuizModalImmediately (which renders the
 * recap into #quiz-content-box) and BEFORE memory-game.js, which keeps that
 * function as its originalOpen. After every recap render this appends an
 * optional "이야기 한 장면 만들기" card. The recap and quiz code are not
 * modified; any missing data or error simply leaves the card out.
 */
(function () {
  'use strict';

  var MY_LINE_MAX = 200;
  var SCENE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
  var origOpenRecap = window.openQuizModalImmediately;
  var contexts = {};
  var renderToken = 0;
  var el = null;

  function client() {
    return window.supabaseClient && window.supabaseClient.auth ? window.supabaseClient : null;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Unplayed scene from the learner's booking interests first, then any
  // unplayed scene. Completed (or hidden) scenes never repeat.
  function pickScene(scenes, interests, doneIds, rand) {
    var random = typeof rand === 'function' ? rand : Math.random;
    var done = {};
    (doneIds || []).forEach(function (id) { done[String(id)] = true; });
    var wanted = {};
    (interests || []).forEach(function (id) { wanted[String(id)] = true; });
    // Only IDs the save RPC accepts (lowercase, digits, hyphens) are offered.
    var fresh = (scenes || []).filter(function (scene) {
      return scene && SCENE_ID.test(String(scene.id)) && !done[scene.id];
    });
    var preferred = fresh.filter(function (scene) { return wanted[scene.interest]; });
    var pool = preferred.length ? preferred : fresh;
    if (!pool.length) return null;
    return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
  }

  function eligibleAccess() {
    var access = window.DayORoomAccess;
    if (!access || !access.allowed || access.role !== 'user') return null;
    if (access.adminTest || access.observer || !access.bookingId || !access.userId) return null;
    if (String(access.language || 'en').toLowerCase() !== 'en') return null;
    if (window.isPartnerRoomMode && window.isPartnerRoomMode()) return null;
    if (window.isObserverRoomMode && window.isObserverRoomMode()) return null;
    return access;
  }

  // One lookup per booking; the picked scene stays stable across re-renders.
  function loadContext(access) {
    var key = access.bookingId;
    if (contexts[key]) return contexts[key];
    contexts[key] = (async function () {
      var db = client();
      if (!db || !Array.isArray(window.DayOStoryScenes)) return null;
      var booking = await db.from('bookings')
        .select('conversation_brief')
        .eq('id', access.bookingId)
        .maybeSingle();
      if (booking.error) return null;
      var brief = booking.data && booking.data.conversation_brief;
      var interests = brief && Array.isArray(brief.interests) ? brief.interests : [];
      var history = await db.from('learner_story_scenes')
        .select('template_id, booking_id')
        .eq('learner_id', access.userId);
      if (history.error) return null;
      var rows = history.data || [];
      var savedHere = rows.some(function (row) { return row.booking_id === access.bookingId; });
      var scene = savedHere ? null : pickScene(window.DayOStoryScenes, interests, rows.map(function (row) { return row.template_id; }));
      return { scene: scene, saved: savedHere };
    })().catch(function () {
      delete contexts[key];
      return null;
    });
    return contexts[key];
  }

  function ensureStyles() {
    if (document.getElementById('dayo-story-bonus-style')) return;
    var style = document.createElement('style');
    style.id = 'dayo-story-bonus-style';
    style.textContent = [
      '.dsb-card-entry{margin:14px 0 0;padding:16px;border:1.5px dashed #F5C9BE;border-radius:16px;background:#FFF9F6;text-align:left;}',
      '.dsb-card-entry h4{margin:0 0 4px;font-size:15px;font-weight:800;color:#222;}',
      '.dsb-card-entry p{margin:0 0 12px;font-size:12.5px;color:#78716C;line-height:1.55;}',
      '.dsb-card-entry .dsb-entry-done{margin:0;font-size:13px;font-weight:700;color:#57534E;}',
      // The card never outgrows the visible viewport: its header (close) and
      // the sticky action row stay on screen while only the body scrolls.
      '.dsb-overlay{position:fixed;top:0;left:0;right:0;height:100%;z-index:500001;display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:12px;background:rgba(0,0,0,.6);backdrop-filter:blur(4px);}',
      '.dsb-shell{position:relative;display:flex;flex-direction:column;width:100%;max-width:440px;max-height:100%;background:#fff;border-radius:22px;box-shadow:0 20px 50px rgba(0,0,0,.25);overflow:hidden;}',
      '.dsb-close{position:absolute;top:10px;right:10px;z-index:2;width:36px;height:36px;border:none;border-radius:50%;background:#F5F5F4;color:#57534E;font-size:18px;line-height:36px;cursor:pointer;font-family:inherit;}',
      '.dsb-card{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding:22px 18px 0;font-family:inherit;color:#222;}',
      '.dsb-badge{display:inline-block;margin:0 44px 10px 0;padding:4px 10px;border-radius:999px;background:#FFF1EC;color:#E85B48;font-size:12px;font-weight:800;}',
      '.dsb-title{margin:0 0 6px;font-size:19px;font-weight:800;line-height:1.35;}',
      '.dsb-sub{margin:0 0 16px;font-size:13px;color:#78716C;line-height:1.6;white-space:pre-line;}',
      '.dsb-img{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:14px;margin:0 0 14px;background:#FAF8F5;}',
      '.dsb-en{margin:0;font-size:15px;font-weight:700;line-height:1.5;}',
      '.dsb-ko{margin:2px 0 0;font-size:13px;color:#78716C;line-height:1.5;}',
      '.dsb-bubble{margin:0 0 14px;padding:12px 14px;border-radius:14px;background:#FAF8F5;}',
      '.dsb-speaker{display:block;margin:0 0 4px;font-size:12px;font-weight:800;color:#E85B48;}',
      '.dsb-options{display:grid;gap:8px;margin:0 0 6px;}',
      '.dsb-option{width:100%;text-align:left;padding:12px 14px;border:1.5px solid #EDE4D5;border-radius:14px;background:#fff;cursor:pointer;font-family:inherit;}',
      '.dsb-option:hover,.dsb-option:focus-visible{border-color:#FF6B57;outline:none;}',
      '.dsb-textarea{width:100%;box-sizing:border-box;min-height:84px;padding:12px 14px;border:1.5px solid #EDE4D5;border-radius:14px;font:inherit;font-size:16px;resize:vertical;}',
      '.dsb-count{margin:4px 0 0;text-align:right;font-size:11px;color:#A8A29E;}',
      '.dsb-actions{position:sticky;bottom:0;display:flex;gap:8px;margin:16px -18px 0;padding:12px 18px calc(14px + env(safe-area-inset-bottom));background:#fff;border-top:1px solid #F5F0EA;}',
      '.dsb-btn{flex:1;padding:13px 14px;border:none;border-radius:14px;font:inherit;font-size:14px;font-weight:800;cursor:pointer;}',
      '.dsb-btn--primary{background:#FF6B57;color:#fff;}',
      '.dsb-btn--ghost{background:#F5F5F4;color:#57534E;}',
      '.dsb-btn[disabled]{opacity:.6;cursor:default;}',
      '.dsb-error{margin:10px 0 0;font-size:12px;color:#DC2626;}'
    ].join('');
    document.head.appendChild(style);
  }

  function lineHtml(text, speaker) {
    return '<div class="dsb-bubble">' +
      (speaker ? '<span class="dsb-speaker">' + escapeHtml(speaker) + '</span>' : '') +
      '<p class="dsb-en" lang="en">' + escapeHtml(text.en) + '</p>' +
      '<p class="dsb-ko">' + escapeHtml(text.ko) + '</p>' +
      '</div>';
  }

  function imageHtml(scene) {
    return '<img class="dsb-img" alt="" src="images/stories/' + escapeHtml(scene.id) + '.webp" onerror="this.remove()">';
  }

  function openOverlay() {
    ensureStyles();
    el = document.createElement('div');
    el.className = 'dsb-overlay';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'dsb-title');
    el.innerHTML = '<div class="dsb-shell">' +
      '<button type="button" class="dsb-close" aria-label="닫기" data-dsb-x>✕</button>' +
      '<div class="dsb-card" id="dsb-card"></div>' +
      '</div>';
    document.body.appendChild(el);
    el.querySelector('[data-dsb-x]').addEventListener('click', closeOverlay);
    fitViewport();
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', fitViewport);
      window.visualViewport.addEventListener('scroll', fitViewport);
    }
  }

  // Follow the visible area so the on-screen keyboard never hides the card.
  function fitViewport() {
    var vv = window.visualViewport;
    if (!el || !vv) return;
    el.style.height = vv.height + 'px';
    el.style.top = vv.offsetTop + 'px';
  }

  function closeOverlay() {
    if (!el) return;
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', fitViewport);
      window.visualViewport.removeEventListener('scroll', fitViewport);
    }
    el.remove();
    el = null;
  }

  function render(html) {
    var card = el && el.querySelector('#dsb-card');
    if (!card) return null;
    card.innerHTML = html;
    var focusTarget = card.querySelector('[data-dsb-focus]') || card.querySelector('button');
    if (focusTarget) focusTarget.focus();
    return card;
  }

  function runStory(access, scene, trigger, onSaved) {
    var picks = [];
    var finish = function () { closeOverlay(); };

    function showStep(index) {
      var step = scene.steps[index];
      var intro = index === 0 ? imageHtml(scene) + lineHtml(scene.intro) : '';
      var card = render(
        '<span class="dsb-badge">' + escapeHtml(scene.title) + ' · ' + (index + 1) + ' / ' + scene.steps.length + '</span>' +
        '<h3 class="dsb-title" id="dsb-title">대답을 골라 주세요</h3>' +
        intro +
        lineHtml(step.line, step.speaker) +
        '<div class="dsb-options">' +
        step.options.map(function (option, i) {
          return '<button type="button" class="dsb-option" data-dsb-option="' + i + '"' + (i === 0 ? ' data-dsb-focus' : '') + '>' +
            '<p class="dsb-en" lang="en">' + escapeHtml(option.en) + '</p>' +
            '<p class="dsb-ko">' + escapeHtml(option.ko) + '</p>' +
            '</button>';
        }).join('') +
        '</div>' +
        '<div class="dsb-actions"><button type="button" class="dsb-btn dsb-btn--ghost" data-dsb-skip>그만하기</button></div>'
      );
      if (!card) return finish();
      card.querySelector('[data-dsb-skip]').addEventListener('click', finish);
      Array.prototype.forEach.call(card.querySelectorAll('[data-dsb-option]'), function (button) {
        button.addEventListener('click', function () {
          picks[index] = step.options[Number(button.getAttribute('data-dsb-option'))];
          if (index + 1 < scene.steps.length) showStep(index + 1);
          else showEnding();
        });
      });
    }

    function showEnding(errorText, draft) {
      var card = render(
        '<span class="dsb-badge">' + escapeHtml(scene.title) + ' · 마무리</span>' +
        '<h3 class="dsb-title" id="dsb-title">장면 완성!</h3>' +
        lineHtml(scene.ending) +
        '<p class="dsb-en" lang="en" style="margin-top:4px;">' + escapeHtml(scene.myLinePrompt.en) + '</p>' +
        '<p class="dsb-ko" style="margin-bottom:8px;">' + escapeHtml(scene.myLinePrompt.ko) + ' (선택)</p>' +
        '<textarea class="dsb-textarea" maxlength="' + MY_LINE_MAX + '" placeholder="내 한 줄을 남겨 보세요. 비워 둬도 괜찮아요." data-dsb-line></textarea>' +
        '<p class="dsb-count" data-dsb-count>0 / ' + MY_LINE_MAX + '</p>' +
        (errorText ? '<p class="dsb-error" role="alert">' + escapeHtml(errorText) + '</p>' : '') +
        '<div class="dsb-actions">' +
        '<button type="button" class="dsb-btn dsb-btn--ghost" data-dsb-skip>' + (errorText ? '그냥 닫기' : '저장 안 하고 닫기') + '</button>' +
        '<button type="button" class="dsb-btn dsb-btn--primary" data-dsb-save>책장에 꽂기 📚</button>' +
        '</div>'
      );
      if (!card) return finish();
      var input = card.querySelector('[data-dsb-line]');
      var count = card.querySelector('[data-dsb-count]');
      if (draft) input.value = draft;
      var syncCount = function () { count.textContent = input.value.length + ' / ' + MY_LINE_MAX; };
      syncCount();
      input.addEventListener('input', syncCount);
      card.querySelector('[data-dsb-skip]').addEventListener('click', finish);
      card.querySelector('[data-dsb-save]').addEventListener('click', function () {
        var button = this;
        button.disabled = true;
        button.textContent = '저장 중…';
        save(input.value).then(function (result) {
          if (result && result.success) showSaved();
          else showEnding('저장하지 못했어요. 잠시 후 다시 시도해 주세요.', input.value);
        }).catch(function () {
          showEnding('저장하지 못했어요. 잠시 후 다시 시도해 주세요.', input.value);
        });
      });
    }

    function snapshot() {
      return {
        scene_id: scene.id,
        title: scene.title,
        intro: scene.intro,
        steps: scene.steps.map(function (step, i) {
          var pick = picks[i] || {};
          return { speaker: step.speaker, line: step.line, choice: { id: pick.id, en: pick.en, ko: pick.ko } };
        }),
        ending: scene.ending,
        my_line_prompt: scene.myLinePrompt
      };
    }

    async function save(myLine) {
      var db = client();
      if (!db) return null;
      var result = await db.rpc('save_story_scene', {
        p_booking_id: access.bookingId,
        p_template_id: scene.id,
        p_template_version: scene.version,
        p_language: 'en',
        p_trigger: trigger,
        p_scene_snapshot: snapshot(),
        p_used_expressions: [],
        p_my_line: String(myLine || '').trim().slice(0, MY_LINE_MAX) || null
      });
      if (result.error) return null;
      return result.data;
    }

    function showSaved() {
      onSaved();
      var card = render(
        '<span class="dsb-badge">📚 책장</span>' +
        '<h3 class="dsb-title" id="dsb-title">책장에 꽂았어요!</h3>' +
        '<p class="dsb-sub">마이페이지 책장에서 언제든 다시 볼 수 있어요.</p>' +
        '<div class="dsb-actions"><button type="button" class="dsb-btn dsb-btn--primary" data-dsb-done data-dsb-focus>리캡으로 돌아가기</button></div>'
      );
      if (!card) return finish();
      card.querySelector('[data-dsb-done]').addEventListener('click', finish);
    }

    showStep(0);
  }

  function entryHtml(context) {
    if (context.saved) {
      return '<section class="dsb-card-entry" data-story-entry><p class="dsb-entry-done">📚 이 대화의 이야기 장면은 책장에 꽂혀 있어요.</p></section>';
    }
    return '<section class="dsb-card-entry" data-story-entry>' +
      '<h4>📖 이야기 한 장면 만들기 (선택)</h4>' +
      '<p>1분이면 끝나요. 정답도 점수도 없어요. 완성한 장면은 마이페이지 책장에 꽂혀요.</p>' +
      '<button type="button" class="recap-primary" data-story-start>시작하기</button>' +
      '</section>';
  }

  function attachCard(token) {
    var access = eligibleAccess();
    if (!access) return;
    loadContext(access).then(function (context) {
      if (!context || (!context.scene && !context.saved)) return;
      if (token !== renderToken) return;
      var box = document.getElementById('quiz-content-box');
      if (!box || box.querySelector('[data-story-entry]')) return;
      ensureStyles();
      box.insertAdjacentHTML('beforeend', entryHtml(context));
      var start = box.querySelector('[data-story-start]');
      if (!start) return;
      start.addEventListener('click', function () {
        var progress = window.__dayoQuizProgress;
        var trigger = progress && Number(progress.total) > 0 ? 'bonus' : 'insufficient';
        openOverlay();
        runStory(access, context.scene, trigger, function () {
          context.saved = true;
          context.scene = null;
          var entry = box.querySelector('[data-story-entry]');
          if (entry) entry.outerHTML = entryHtml(context);
        });
      });
    });
  }

  function openRecapWithStory() {
    var result = origOpenRecap.apply(this, arguments);
    renderToken += 1;
    try { attachCard(renderToken); } catch (e) { /* the recap never depends on the story card */ }
    return result;
  }

  if (typeof origOpenRecap === 'function') {
    window.openQuizModalImmediately = openRecapWithStory;
  }

  window.DayOStoryBonus = { pickScene: pickScene };
})();
