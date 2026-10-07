(function () {
  'use strict';

  var reminders = [
    'I will let the user finish speaking before I help.',
    'I will correct naturally without turning the conversation into a lesson.',
    'I will use Talk Cards when the conversation slows down.',
    'I will keep everything the user shares confidential.',
    'I will write a personal Partner Letter based on today’s actual conversation.'
  ];

  window.DayOPartnerPreSession = {
    request: function (access) {
      return new Promise(function (resolve) {
        function open() {
          if (window.__dayoInAppBlocked) { resolve(false); return; }
          var previousFocus = document.activeElement;
          var dialog = document.createElement('dialog');
          dialog.className = 'partner-pre-session';
          dialog.lang = 'en';
          dialog.setAttribute('aria-labelledby', 'partner-pre-session-title');
          dialog.setAttribute('aria-describedby', 'partner-pre-session-helper');
          dialog.innerHTML = '<form><header><h2 id="partner-pre-session-title">Before you enter</h2>' +
            '<p id="partner-pre-session-helper">A quick reminder for a comfortable, personal conversation.</p></header>' +
            '<div class="partner-pre-session-list"></div><footer>' +
            '<button type="button" data-cancel>Not now</button>' +
            '<button type="submit" data-enter disabled>Enter conversation</button></footer></form>';
          var list = dialog.querySelector('.partner-pre-session-list');
          reminders.forEach(function (text) {
            var label = document.createElement('label');
            var checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            var copy = document.createElement('span');
            copy.textContent = text;
            label.appendChild(checkbox);
            label.appendChild(copy);
            list.appendChild(label);
          });
          var boxes = Array.from(list.querySelectorAll('input'));
          var enter = dialog.querySelector('[data-enter]');
          var settled = false;
          function finish(completed) {
            if (settled) return;
            settled = true;
            dialog.close();
            dialog.remove();
            if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
            if (completed) {
              // The current session_events RPC rejects this event type. Emit locally
              // without changing its schema or making entry depend on analytics.
              try {
                document.dispatchEvent(new CustomEvent('partner_pre_session_checklist_completed', { detail: {
                  booking_id: access.bookingId || null,
                  partner_user_id: access.userId,
                  completed_at: new Date().toISOString()
                } }));
              } catch (_) { /* analytics must not prevent entry */ }
            }
            resolve(completed);
          }
          list.addEventListener('change', function () {
            enter.disabled = !boxes.every(function (box) { return box.checked; });
          });
          dialog.querySelector('form').addEventListener('submit', function (event) {
            event.preventDefault();
            if (boxes.every(function (box) { return box.checked; })) finish(true);
          });
          dialog.querySelector('[data-cancel]').addEventListener('click', function () { finish(false); });
          dialog.addEventListener('cancel', function (event) { event.preventDefault(); finish(false); });
          dialog.addEventListener('keydown', function (event) {
            if (event.key !== 'Tab') return;
            var controls = Array.from(dialog.querySelectorAll('input, button:not(:disabled)'));
            var first = controls[0], last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault(); last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault(); first.focus();
            }
          });
          document.body.appendChild(dialog);
          try { dialog.showModal(); } catch (_) { dialog.remove(); resolve(false); }
        }
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', open, { once: true });
        else open();
      });
    }
  };
})();
