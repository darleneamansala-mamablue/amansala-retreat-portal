// ===== spa-discounts.js — edit an appointment's price and give a discount, % or $ (Darlene 2026-11-10) =====
// Loaded as a classic script AFTER spa.js, spa-calendar.js and spa-booked-by.js; shares global scope. Those files are not edited: their functions are wrapped.
// In the spa appointment form a "Price & discount" box sits under the service's rate:
//   Price ($)        blank = the service's normal price; type a number to charge something different for THIS appointment only (the service list is not changed)
//   Discount         None / % off / $ off, and a value; an optional reason
//   Final price      shown live ("$120 → $102, saves $18")
// Saved on the appointment (priceOverrideUSD, discountType 'pct'|'usd', discountValue, discountNote). The final price is what the spa revenue totals (spaApptRevenue) and the charge to the guest's
// room use. Nothing about an appointment that has no price/discount changes.
function spdBase(a, svc) {
  if (!a || !svc) return null;
  if (a.priceOverrideUSD != null && a.priceOverrideUSD !== '') return Number(a.priceOverrideUSD);
  return svc.groupPricing ? (a.groupTotalPriceUSD != null ? a.groupTotalPriceUSD : svc.price) : svc.price;
}
function spdApply(base, type, value) {
  if (base == null || isNaN(base)) return null;
  const v = Number(value) || 0;
  let f = base;
  if (type === 'pct') f = base * (1 - Math.min(Math.max(v, 0), 100) / 100);
  else if (type === 'usd') f = base - Math.max(v, 0);
  return Math.max(0, Math.round(f * 100) / 100);
}
function spdFinal(a, svc) { const b = spdBase(a, svc); return b == null ? null : spdApply(b, a.discountType, a.discountValue); }
const spdMoney = n => '$' + (Math.round(n * 100) / 100).toString();
const spdEsc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

// ---- the form box ----
function spdInject() {
  if (document.getElementById('spdBox')) return;
  const anchor = document.getElementById('spaApptPriceDisplay'); if (!anchor) return;
  const f = 'padding:7px 9px;border:1.5px solid #c8bfb5;border-radius:8px;font-family:\'Jost\',sans-serif;font-size:13px;background:#fff';
  const box = document.createElement('div'); box.id = 'spdBox';
  box.style.cssText = 'margin-top:8px;background:#fffbeb;border:1.5px solid #fde68a;border-radius:9px;padding:9px 12px;display:flex;flex-direction:column;gap:7px';
  box.innerHTML = `<div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#92400e">Price &amp; discount</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <label style="font-size:12px;font-weight:700;color:#5a5048">Price ($) <input id="spdPrice" type="number" min="0" step="0.01" placeholder="service price" oninput="spdUpdate()" style="${f};width:110px"></label>
      <label style="font-size:12px;font-weight:700;color:#5a5048">Discount <select id="spdType" onchange="spdUpdate()" style="${f}"><option value="">None</option><option value="pct">% off</option><option value="usd">$ off</option></select></label>
      <input id="spdValue" type="number" min="0" step="0.01" placeholder="amount" oninput="spdUpdate()" style="${f};width:90px">
    </div>
    <input id="spdNote" type="text" placeholder="Reason for the discount (optional)" style="${f};width:100%;box-sizing:border-box">
    <div id="spdFinal" style="font-size:13px;font-weight:700;color:#0f766e"></div>`;
  anchor.parentNode.insertBefore(box, anchor.nextSibling);
}
function spdSvc() { try { return SpaData.services.find(s => s.id === document.getElementById('spaApptService').value); } catch (e) { return null; } }
function spdRead() {
  const price = document.getElementById('spdPrice').value, type = document.getElementById('spdType').value, val = document.getElementById('spdValue').value;
  return { priceOverrideUSD: price === '' ? null : Number(price), discountType: type || null, discountValue: type && val !== '' ? Number(val) : null, discountNote: document.getElementById('spdNote').value.trim() };
}
function spdUpdate() {
  const out = document.getElementById('spdFinal'); if (!out) return;
  const svc = spdSvc(), v = spdRead();
  const valEl = document.getElementById('spdValue'); if (valEl) valEl.disabled = !v.discountType;
  const base = svc ? spdBase({ priceOverrideUSD: v.priceOverrideUSD }, svc) : null;
  if (base == null) { out.textContent = svc ? 'This service has no price set.' : ''; return; }
  const fin = spdApply(base, v.discountType, v.discountValue);
  out.textContent = fin !== base ? `Final price: ${spdMoney(base)} → ${spdMoney(fin)} (saves ${spdMoney(base - fin)})` : `Final price: ${spdMoney(base)}`;
}
function spdFill(a) {
  spdInject();
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : v; };
  set('spdPrice', a && a.priceOverrideUSD != null ? a.priceOverrideUSD : '');
  set('spdType', a && a.discountType || ''); set('spdValue', a && a.discountValue != null ? a.discountValue : ''); set('spdNote', a && a.discountNote || '');
  spdUpdate();
}

(function () {
  // revenue totals use the final price
  if (typeof spaApptRevenue === 'function') {
    const base = spaApptRevenue;
    window.spaApptRevenue = function (a) {
      try { const svc = SpaData.services.find(s => s.id === a.serviceId); if (svc && (a.priceOverrideUSD != null || a.discountType)) { const f = spdFinal(a, svc); if (f != null) return f; } } catch (e) {}
      return base.apply(this, arguments);
    };
  }
  // the form: show the box, fill it, keep the final price live when the service changes
  if (typeof spaApptShowForm === 'function') {
    const base = spaApptShowForm;
    window.spaApptShowForm = function (id) { const out = base.apply(this, arguments); try { spdFill(id ? SpaAppointments.find(x => x.id === id) : null); } catch (e) { console.warn('[spa-discounts]', e); } return out; };
  }
  if (typeof spaApptUpdatePriceDisplay === 'function') {
    const base = spaApptUpdatePriceDisplay;
    window.spaApptUpdatePriceDisplay = function () { const out = base.apply(this, arguments); try { spdUpdate(); } catch (e) {} return out; };
  }
  // save: check the numbers, then stamp them on the appointment just before it is stored (spaCalSave is called by the form's save)
  let pending = null;
  if (typeof spaApptSave === 'function') {
    const base = spaApptSave;
    window.spaApptSave = function () {
      pending = null;
      try {
        if (document.getElementById('spdBox')) {
          const v = spdRead();
          if (v.priceOverrideUSD != null && (isNaN(v.priceOverrideUSD) || v.priceOverrideUSD < 0)) { alert('The price must be 0 or more.'); return; }
          if (v.discountType === 'pct' && (v.discountValue == null || isNaN(v.discountValue) || v.discountValue < 0 || v.discountValue > 100)) { alert('A % discount must be between 0 and 100.'); return; }
          if (v.discountType === 'usd' && (v.discountValue == null || isNaN(v.discountValue) || v.discountValue < 0)) { alert('A $ discount must be 0 or more.'); return; }
          pending = { id: document.getElementById('spaApptId').value, v };
        }
      } catch (e) { console.warn('[spa-discounts]', e); }
      try { return base.apply(this, arguments); } finally { pending = null; }
    };
  }
  if (typeof spaCalSave === 'function') {
    const base = spaCalSave;
    window.spaCalSave = function () {
      try {
        if (pending) {
          const a = pending.id ? SpaAppointments.find(x => x.id === pending.id) : SpaAppointments[SpaAppointments.length - 1];
          if (a && (pending.id || (a.createdAt && Date.now() - Date.parse(a.createdAt) < 30000))) {
            const was = JSON.stringify([a.priceOverrideUSD == null ? null : a.priceOverrideUSD, a.discountType || null, a.discountValue == null ? null : a.discountValue]);
            Object.assign(a, pending.v);
            const now = JSON.stringify([a.priceOverrideUSD == null ? null : a.priceOverrideUSD, a.discountType || null, a.discountValue == null ? null : a.discountValue]);
            if (pending.id && was !== now) {
              const svc = SpaData.services.find(s => s.id === a.serviceId), f = spdFinal(a, svc);
              (a.editHistory = a.editHistory || []).push({ at: new Date().toISOString(), by: (typeof getCurrentSession === 'function' && (getCurrentSession() || {}).name) || 'Staff', changes: [{ field: 'price', label: 'Price / discount', from: 'before', to: f != null ? spdMoney(f) : 'changed' }] });
            }
          }
          pending = null;
        }
      } catch (e) { console.warn('[spa-discounts]', e); }
      return base.apply(this, arguments);
    };
  }
  // charging the guest's room uses the final price (the charge reads the service's price, so it is swapped in for that one call and put straight back)
  if (typeof spaChargeApptToRoom === 'function') {
    const base = spaChargeApptToRoom;
    window.spaChargeApptToRoom = function (apptId) {
      let restore = null;
      try {
        const a = (SpaAppointments || []).find(x => x.id === apptId), svc = a && SpaData.services.find(s => s.id === a.serviceId);
        if (a && svc && (a.priceOverrideUSD != null || a.discountType)) {
          const f = spdFinal(a, svc);
          if (f != null) {
            const sp = svc.price, sg = svc.groupPricing, ag = a.groupTotalPriceUSD;
            svc.price = f; svc.groupPricing = undefined; a.groupTotalPriceUSD = undefined;
            restore = () => { svc.price = sp; svc.groupPricing = sg; a.groupTotalPriceUSD = ag; };
          }
        }
      } catch (e) {}
      // the charge reads the price before its first wait, so the real price goes back the moment the call hands control back (the service list is never left changed)
      try { return base.apply(this, arguments); } finally { if (restore) restore(); }
    };
  }
})();
