// ===== menu-portion-rule.js — protein portion rule on the menu: 200 g for Brunch / Lunch, 250 g for Dinner (Darlene 2026-10-30) =====
// Loaded as a classic script AFTER menu.js, menu-click-edit.js and menu-cooking-print.js; shares global scope. Standalone: only wraps menuRenderMealSection, menuRenderDinner and the
// kitchen prints. It SHOWS the rule: on the Menu tab the Brunch, Lunch and Dinner headers of every day read "BRUNCH · 200 g", "LUNCH · 200 g", "DINNER · 250 g" (protein per person).
// The Kitchen copy of the printed menus shows the same; the guest copy does not. It does not change any saved menu data or the cost panel's numbers.
(function () {
  const G = { brunch: 200, lunch: 200, dinner: 250 };
  const tag = k => ` <span style="font-weight:600;opacity:.8;text-transform:none;letter-spacing:0" title="Protein per person">· ${G[k]} g</span>`;

  const wrapScreen = (name, key) => {
    const prev = window[name]; if (typeof prev !== 'function') return;
    window[name] = function (dateStr, mealKey) {
      const html = prev.apply(this, arguments);
      try {
        const k = key || mealKey; if (!G[k] || typeof html !== 'string') return html;
        const lab = (typeof MENU_MEAL_CFG !== 'undefined' && MENU_MEAL_CFG[k] && MENU_MEAL_CFG[k].label) || '';
        return lab ? html.replace('>' + lab + '</div>', '>' + lab + tag(k) + '</div>') : html;
      } catch (e) { return html; }
    };
  };
  wrapScreen('menuRenderMealSection', null);
  wrapScreen('menuRenderDinner', 'dinner');

  // Kitchen prints: add the grams to the Brunch / Lunch / Dinner headings
  function kitchenEdit(doc) {
    doc.querySelectorAll('.rw-meal-hdr, .menu-poster-label').forEach(h => {
      const t = (h.textContent || '').trim().toLowerCase(), k = t === 'brunch' ? 'brunch' : t === 'lunch' ? 'lunch' : t === 'dinner' ? 'dinner' : '';
      if (k) h.insertAdjacentHTML('beforeend', ` · ${G[k]} g`);
    });
  }
  function withEdit(fn) {
    const realOpen = window.open;
    window.open = function () {
      const w = realOpen.apply(window, arguments);
      try {
        if (w && w.document) {
          const ow = w.document.write.bind(w.document);
          w.document.write = function (html) {
            try { if (typeof html === 'string' && /<html/i.test(html)) { const doc = new DOMParser().parseFromString(html, 'text/html'); kitchenEdit(doc); html = '<!DOCTYPE html>' + doc.documentElement.outerHTML; } } catch (e) {}
            return ow(html);
          };
        }
      } catch (e) {}
      return w;
    };
    try { return fn(); } finally { window.open = realOpen; }
  }
  ['menuPrintWeekReadable', 'menuPrintDailyRange'].forEach(n => {
    const prev = window[n]; if (typeof prev !== 'function') return;
    window[n] = function (from, to, kitchen) { const a = arguments, self = this; return kitchen ? withEdit(() => prev.apply(self, a)) : prev.apply(self, a); };
  });
})();
