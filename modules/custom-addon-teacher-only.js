// ===== custom-addon-teacher-only.js — one-off custom add-ons that are charged ONCE, to the teacher only (Darlene 2026-10-30) =====
// Loaded as a classic script AFTER global-rate.js; shares global scope. Standalone: calcCustomAoCost and _customAoSectionHtml are only wrapped.
// Custom add-ons (packageCustomPrices.__custom__) are charged to EVERY guest. Tick "Teacher only (one time)" on an add-on and it is charged one time, on the
// teacher's own room, and nothing is added to the guests. The ticked names live in packageCustomPrices.__cfg__.teacherOnlyAddons (a list of names),
// so the Packages editor, which rebuilds the add-on list, cannot drop the setting.
(function () {
  const names = bk => { try { return (bk && bk.packageCustomPrices && bk.packageCustomPrices.__cfg__ && bk.packageCustomPrices.__cfg__.teacherOnlyAddons) || []; } catch (e) { return []; } };
  const orig = window.calcCustomAoCost;
  if (typeof orig !== 'function') return;
  const wrapped = function (bk, gc, reg) {
    const t = names(bk);
    if (!t.length) return orig.apply(this, arguments);
    const pcp = bk.packageCustomPrices, all = pcp.__custom__ || [];
    const guestPart = Object.create(bk); guestPart.packageCustomPrices = Object.assign({}, pcp, { __custom__: all.filter(c => !t.includes(c.name)) });
    let total = orig.call(this, guestPart, gc, reg);
    if (reg && reg.isTeacherRoom && reg.customPkgPrice == null) {
      total += all.filter(c => t.includes(c.name)).reduce((s, c) => { const p = Number(c.price || 0) * Number(c.nights || 1); return s + p + p * Number(c.taxRate || 0); }, 0);
    }
    return +Number(total).toFixed(2);
  };
  window.calcCustomAoCost = wrapped;
  try { calcCustomAoCost = wrapped; } catch (e) {}

  const prevHtml = window._customAoSectionHtml;
  if (typeof prevHtml === 'function') {
    window._customAoSectionHtml = function (bk) {
      let h = prevHtml.apply(this, arguments);
      try {
        const list = (bk.packageCustomPrices && bk.packageCustomPrices.__custom__) || [], t = names(bk);
        list.forEach((c, i) => {
          const on = t.includes(c.name);
          h = h.replace('<button onclick="removeCustomAddon(' + i + ')"', '<label style="font-size:11.5px;color:#92400e;white-space:nowrap;cursor:pointer" title="Charged one time on the teacher\'s room, not on every guest"><input type="checkbox" ' + (on ? 'checked ' : '') + 'onchange="caoTeacherOnly(' + i + ',this.checked)"> Teacher only (one time)</label><button onclick="removeCustomAddon(' + i + ')"');
        });
      } catch (e) { console.warn('[custom-addon-teacher-only]', e); }
      return h;
    };
  }
  window.caoTeacherOnly = async function (i, on) {
    const bk = window.regSelBk || (typeof regSelBk !== 'undefined' ? regSelBk : null); if (!bk) return;
    const c = ((bk.packageCustomPrices || {}).__custom__ || [])[i]; if (!c) return;
    const cfg = (bk.packageCustomPrices.__cfg__ = Object.assign({}, bk.packageCustomPrices.__cfg__));
    const t = (cfg.teacherOnlyAddons || []).filter(n => n !== c.name); if (on) t.push(c.name);
    if (t.length) cfg.teacherOnlyAddons = t; else delete cfg.teacherOnlyAddons;
    saveAll(); regRender(); try { pkgTogglePriceEditor(); } catch (e) {}
    try { await db.from('bookings').update({ package_custom_prices: bk.packageCustomPrices }).eq('id', bk.id); } catch (e) {}
    if (typeof showToast === 'function') showToast(on ? '"' + c.name + '" is now charged once, to the teacher only ✓' : '"' + c.name + '" is charged to every guest again');
  };
})();
