/* DayO My Page story bookshelf ("책장"): learner's completed story scenes.
 * Read-only list from learner_story_scenes (owner RLS); hiding goes through
 * set_story_scene_hidden. The section stays hidden when there is nothing to
 * show or the table is not available yet.
 */
(function () {
  'use strict';

  var scenes = [];

  function client() {
    return window.supabaseClient && window.supabaseClient.auth ? window.supabaseClient : null;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function text(pair, key) {
    return pair && typeof pair[key] === 'string' ? pair[key] : '';
  }

  function formatDate(value) {
    var date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return date.getFullYear() + '.' + String(date.getMonth() + 1).padStart(2, '0') + '.' + String(date.getDate()).padStart(2, '0');
  }

  function safeId(value) {
    var id = String(value || '');
    return /^[a-z0-9][a-z0-9_-]{0,63}$/.test(id) ? id : '';
  }

  function ensureStyles() {
    if (document.getElementById('dayo-story-shelf-style')) return;
    var style = document.createElement('style');
    style.id = 'dayo-story-shelf-style';
    style.textContent = [
      '.dss-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:12px;}',
      '.dss-book{display:flex;flex-direction:column;text-align:left;padding:0;border:1px solid #EDE4D5;border-radius:16px;background:#FFFCF8;cursor:pointer;overflow:hidden;font-family:inherit;}',
      '.dss-book:hover,.dss-book:focus-visible{border-color:#5F7D63;outline:none;}',
      '.dss-cover{width:100%;aspect-ratio:16/10;object-fit:cover;background:#FAF1E6;display:block;}',
      '.dss-cover--empty{display:flex;align-items:center;justify-content:center;font-size:28px;}',
      '.dss-body{padding:10px 12px 12px;}',
      '.dss-title{margin:0;font-size:14px;font-weight:800;color:#222;}',
      '.dss-date{margin:2px 0 0;font-size:11px;color:#A8A29E;}',
      '.dss-line{margin:8px 0 0;font-size:12px;color:#57534E;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}',
      '.dss-overlay{position:fixed;inset:0;z-index:10001;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.55);overflow-y:auto;}',
      '.dss-modal{width:100%;max-width:440px;max-height:90vh;overflow-y:auto;background:#fff;border-radius:22px;padding:22px 20px 18px;font-family:inherit;color:#222;}',
      '.dss-modal h3{margin:0 0 12px;font-size:18px;font-weight:800;}',
      '.dss-bubble{margin:0 0 10px;padding:11px 13px;border-radius:14px;background:#FAF8F5;}',
      '.dss-bubble--mine{background:#FFF1EC;}',
      '.dss-speaker{display:block;margin:0 0 3px;font-size:11px;font-weight:800;color:#4B6650;}',
      '.dss-en{margin:0;font-size:14px;font-weight:700;line-height:1.5;}',
      '.dss-ko{margin:2px 0 0;font-size:12px;color:#78716C;line-height:1.5;}',
      '.dss-actions{display:flex;gap:8px;margin-top:14px;}',
      '.dss-btn{flex:1;padding:12px;border:none;border-radius:14px;font:inherit;font-size:13px;font-weight:800;cursor:pointer;}',
      '.dss-btn--ghost{background:#F5F5F4;color:#57534E;}',
      '.dss-btn--primary{background:#5F7D63;color:#fff;}',
      '.dss-btn[disabled]{opacity:.6;cursor:default;}'
    ].join('');
    document.head.appendChild(style);
  }

  function bubble(pair, speaker, mine) {
    return '<div class="dss-bubble' + (mine ? ' dss-bubble--mine' : '') + '">' +
      (speaker ? '<span class="dss-speaker">' + escapeHtml(speaker) + '</span>' : '') +
      '<p class="dss-en" lang="en">' + escapeHtml(text(pair, 'en')) + '</p>' +
      '<p class="dss-ko">' + escapeHtml(text(pair, 'ko')) + '</p>' +
      '</div>';
  }

  function coverHtml(row) {
    var id = safeId(row.template_id);
    if (!id) return '<div class="dss-cover dss-cover--empty" aria-hidden="true">📖</div>';
    return '<img class="dss-cover" alt="" src="images/stories/' + id + '.webp" ' +
      'onerror="this.outerHTML=\'<div class=&quot;dss-cover dss-cover--empty&quot; aria-hidden=&quot;true&quot;>📖</div>\'">';
  }

  function renderShelf() {
    var section = document.getElementById('story-bookshelf');
    var grid = document.getElementById('story-bookshelf-grid');
    var count = document.getElementById('story-bookshelf-count');
    if (!section || !grid) return;
    if (!scenes.length) {
      section.hidden = true;
      return;
    }
    ensureStyles();
    if (count) count.textContent = '총 ' + scenes.length + '권';
    grid.innerHTML = scenes.map(function (row, index) {
      var snap = row.scene_snapshot || {};
      return '<button type="button" class="dss-book" data-dss-open="' + index + '">' +
        coverHtml(row) +
        '<span class="dss-body">' +
        '<p class="dss-title">' + escapeHtml(snap.title || '이야기 한 장면') + '</p>' +
        '<p class="dss-date">' + escapeHtml(formatDate(row.created_at)) + '</p>' +
        (row.my_line ? '<p class="dss-line">“' + escapeHtml(row.my_line) + '”</p>' : '') +
        '</span></button>';
    }).join('');
    section.hidden = false;
  }

  function closeDetail(overlay) {
    overlay.remove();
    if (window.DayOScrollLock) window.DayOScrollLock.unlock();
  }

  function openDetail(index) {
    var row = scenes[index];
    if (!row) return;
    var snap = row.scene_snapshot || {};
    var steps = Array.isArray(snap.steps) ? snap.steps : [];
    var overlay = document.createElement('div');
    overlay.className = 'dss-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'dss-detail-title');
    overlay.innerHTML = '<div class="dss-modal">' +
      '<h3 id="dss-detail-title">' + escapeHtml(snap.title || '이야기 한 장면') + '</h3>' +
      bubble(snap.intro) +
      steps.map(function (step) {
        return bubble(step.line, step.speaker) + bubble(step.choice, '나', true);
      }).join('') +
      bubble(snap.ending) +
      (row.my_line
        ? '<div class="dss-bubble dss-bubble--mine"><span class="dss-speaker">내 한 줄</span>' +
          (snap.my_line_prompt ? '<p class="dss-ko">' + escapeHtml(text(snap.my_line_prompt, 'ko')) + '</p>' : '') +
          '<p class="dss-en">' + escapeHtml(row.my_line) + '</p></div>'
        : '') +
      '<div class="dss-actions">' +
      '<button type="button" class="dss-btn dss-btn--ghost" data-dss-hide>책장에서 빼기</button>' +
      '<button type="button" class="dss-btn dss-btn--primary" data-dss-close>닫기</button>' +
      '</div></div>';
    document.body.appendChild(overlay);
    if (window.DayOScrollLock) window.DayOScrollLock.lock();
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) closeDetail(overlay);
    });
    overlay.querySelector('[data-dss-close]').addEventListener('click', function () { closeDetail(overlay); });
    overlay.querySelector('[data-dss-close]').focus();
    overlay.querySelector('[data-dss-hide]').addEventListener('click', function () {
      var button = this;
      button.disabled = true;
      hideScene(row.id).then(function (ok) {
        if (!ok) {
          button.disabled = false;
          button.textContent = '다시 시도';
          return;
        }
        scenes = scenes.filter(function (item) { return item.id !== row.id; });
        closeDetail(overlay);
        renderShelf();
      });
    });
  }

  async function hideScene(sceneId) {
    var db = client();
    if (!db) return false;
    try {
      var result = await db.rpc('set_story_scene_hidden', { p_scene_id: sceneId, p_hidden: true });
      return !result.error && !!(result.data && result.data.success);
    } catch (e) {
      return false;
    }
  }

  async function load() {
    var db = client();
    var section = document.getElementById('story-bookshelf');
    if (!db || !section) return;
    try {
      var session = await db.auth.getSession();
      var user = session && session.data && session.data.session && session.data.session.user;
      if (!user) return;
      var result = await db.from('learner_story_scenes')
        .select('id, template_id, scene_snapshot, my_line, created_at')
        .eq('learner_id', user.id)
        .is('hidden_at', null)
        .order('created_at', { ascending: false });
      if (result.error) return;
      scenes = result.data || [];
      renderShelf();
    } catch (e) {
      /* keep the shelf hidden */
    }
  }

  document.addEventListener('click', function (event) {
    var target = event.target && event.target.closest ? event.target.closest('[data-dss-open]') : null;
    if (target) openDetail(Number(target.getAttribute('data-dss-open')));
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
