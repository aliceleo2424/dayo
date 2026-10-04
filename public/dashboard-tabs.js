/* Presentation-only tabs. Existing feature nodes and event handlers stay intact. */
(function () {
  'use strict';
  window.DayODashboardTabs = {
    mount: function (root, items, label) {
      var nav = document.createElement('div'); nav.className = 'dashboard-tabs';
      nav.setAttribute('role','tablist'); nav.setAttribute('aria-label',label);
      var buttons = items.map(function (item, index) {
        var button = document.createElement('button'); button.type = 'button'; button.id = item.panel.id + '-tab';
        button.dataset.en = item.en; button.dataset.ko = item.ko;
        button.setAttribute('role','tab'); button.setAttribute('aria-controls',item.panel.id);
        item.panel.setAttribute('role','tabpanel'); item.panel.setAttribute('aria-labelledby',button.id);
        item.panel.tabIndex = 0; item.panel.classList.add('dashboard-tab-panel');
        button.addEventListener('click',function () { select(index); });
        button.addEventListener('keydown',function (event) {
          var next = index;
          if (event.key === 'ArrowRight') next = (index + 1) % items.length;
          else if (event.key === 'ArrowLeft') next = (index + items.length - 1) % items.length;
          else if (event.key === 'Home') next = 0;
          else if (event.key === 'End') next = items.length - 1;
          else return;
          event.preventDefault(); select(next); buttons[next].focus();
        });
        nav.append(button); return button;
      });
      var storageKey = 'dayo-dashboard-tab:' + items[0].panel.id.split('-')[0];
      function select(active, remember) {
        items.forEach(function (item,index) {
          item.panel.hidden = index !== active;
          buttons[index].setAttribute('aria-selected',String(index === active));
          buttons[index].tabIndex = index === active ? 0 : -1;
        });
        if (remember !== false) {
          try { window.sessionStorage.setItem(storageKey,items[active].panel.id); } catch (_) {}
          if (window.history && (!window.location.hash || items.some(function(item){return '#' + item.panel.id === window.location.hash;}))) {
            window.history.replaceState(null,'',window.location.pathname + window.location.search + '#' + items[active].panel.id);
          }
        }
      }
      function localize() {
        var ko = document.documentElement.lang === 'ko';
        buttons.forEach(function (button) { button.textContent = ko ? button.dataset.ko : button.dataset.en; });
      }
      function fromHash() { return items.findIndex(function(item){return '#' + item.panel.id === (window.location && window.location.hash);}); }
      var initial = fromHash(), saved;
      try { saved = window.sessionStorage.getItem(storageKey); } catch (_) {}
      if (initial < 0) initial = items.findIndex(function(item){return item.panel.id === saved;});
      localize(); select(initial < 0 ? 0 : initial,false); document.addEventListener('dayo:langchange',localize);
      if (window.addEventListener) window.addEventListener('hashchange',function(){var index=fromHash();if(index>=0)select(index,false);});
      root.append(nav); items.forEach(function (item) { root.append(item.panel); });
      return nav;
    }
  };
})();
