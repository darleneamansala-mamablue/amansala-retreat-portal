// ===== SETTINGS (staff-only business-rule editor) =====
// Jorge's ask 2026-10-15: "todo lo que te pedimos modificar que el staff pueda hacerlo" --
// a single place for the business-rule numbers that used to be hardcoded across the
// codebase (tax rates, transport prices, commission %, hold timing, notification
// toggles, contract deadlines, the Special Package Pricing allowlist). Stored in
// Supabase app_store key 'portal_settings', loaded into the global `PortalSettings`
// in booking-hub.html's loadFromSupabase(). Every default here matches exactly what
// was hardcoded before, so nothing changes until staff actually saves this screen.
//
// Only reachable through Admin > Settings in the main staff/admin login -- a
// therapist's own login (modules/staff-confirm-portal.js, ?mode=confirm) is a
// completely separate rendering tree that never loads this module or touches
// switchTab()/the Admin sidebar at all (same reasoning as Spa > Auto-Assign).
// Small shared readers used by other modules (venues.js, transport.js, booking-detail.js)
// so every commission calculation reads the same live setting instead of its own copy.
function portalCommissionRate(){return ((typeof PortalSettings!=='undefined'&&PortalSettings.commissionRatePct)||5)/100;}
function portalRoomsTaxRate(){return ((typeof PortalSettings!=='undefined'&&PortalSettings.roomsInternalTaxPct)||16)/100;}
function portalSettingsRender(){
  const el=document.getElementById('portalSettingsContent');
  const s=PortalSettings;
  const row=(label,inputHtml,hint)=>`<div style="display:grid;grid-template-columns:260px 1fr;gap:16px;align-items:start;padding:10px 0;border-bottom:1px solid var(--border)">
    <div style="font-size:13px;font-weight:600;color:var(--dark)">${label}${hint?`<div style="font-size:11.5px;font-weight:400;color:#8a7e74;margin-top:2px">${hint}</div>`:''}</div>
    <div>${inputHtml}</div>
  </div>`;
  const inp=(id,val,type='text',w='100px')=>`<input id="${id}" type="${type}" value="${String(val).replace(/"/g,'&quot;')}" style="width:${w};padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;font-family:'Jost',sans-serif">`;
  const toggle=(id,val)=>`<label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input id="${id}" type="checkbox" ${val?'checked':''} style="width:16px;height:16px"><span style="font-size:12.5px;color:#8a7e74">${val?'On':'Off'}</span></label>`;
  const section=(title,sub,body)=>`<div style="background:#fff;border-radius:14px;padding:24px 28px;margin-bottom:20px">
    <div style="font-size:15px;font-weight:700;margin-bottom:4px">${title}</div>
    ${sub?`<div style="font-size:12px;color:#8a7e74;margin-bottom:14px">${sub}</div>`:''}
    ${body}
  </div>`;
  const cd=s.contractDeadlines, tr=s.transportRates, n=s.notifications;
  el.innerHTML=`
    <div style="max-width:780px">
      <h2 style="font-family:'Jost',sans-serif;margin:0 0 4px">Settings</h2>
      <p style="color:#8a7e74;font-size:13px;margin:0 0 24px">Business rules used across the Portal. Changing a number here takes effect the next time it's used — nothing retroactive.</p>

      ${section('Taxes','',`
        ${row('Spa / Transport tax (%)',inp('psSpaTax',s.spaTransportTaxPct,'number'),'Applied to spa services and airport transfers (guest-facing + Lana/Visito)')}
        ${row('Rooms internal tax (%)',inp('psRoomsTax',s.roomsInternalTaxPct,'number'),'Used throughout Rooms/reports pricing (not the guest-facing retreat-booking widget, which is set per retreat in We Take Payment)')}
      `)}

      ${section('Staff commission','',`
        ${row('Commission rate (%)',inp('psCommission',s.commissionRatePct,'number'),'Applied to room upgrades, direct Rooms bookings, and staff-added folio charges')}
      `)}

      ${section('Transport pricing','Per-person rate by airport and group size (1 through 6+ sharing the same van) — same table used to quote and auto-charge transfers.',`
        ${row('Cancún (comma-separated, 1→6+)',inp('psRateCancun',tr.cancun.join(', '),'text','100%'))}
        ${row('Tulum (comma-separated, 1→6+)',inp('psRateTulum',tr.tulum.join(', '),'text','100%'))}
      `)}

      ${section('Holds & timing','',`
        ${row('Checkout hold (minutes)',inp('psHoldTtl',s.holdTtlMinutes,'number'),'How long a room/bedroom/transfer stays reserved for a guest mid-payment before releasing back to inventory')}
      `)}

      ${section('Guest notifications','Toggle automatic guest-facing messages. (These still require the matching service — Resend, Visito/WhatsApp — to be configured; this only controls whether the Portal sends them.)',`
        ${row('Checkout payment-link WhatsApp',toggle('psNotifCheckout',n.checkoutLinksEnabled))}
        ${row('Escape/Room booking WhatsApp confirmation',toggle('psNotifEscape',n.escapeWaConfirmEnabled))}
        ${row('Daily A/C ("climas") staff report',toggle('psNotifClimas',n.climasReportEnabled))}
      `)}

      ${section('Contract deadlines','Days before the retreat start date. Only the numbers — the contract wording itself is still edited in Contract Templates.',`
        ${row('Full payment due',inp('psDlFullPay',cd.fullPaymentDaysBefore,'number'))}
        ${row('Cancellation deadline',inp('psDlCancel',cd.cancelDeadlineDaysBefore,'number'))}
        ${row('Room allotment release',inp('psDlRoomRelease',cd.roomAllotmentReleaseDaysBefore,'number'))}
        ${row('Flight details due',inp('psDlFlight',cd.flightDetailsDaysBefore,'number'))}
        ${row('Last-minute registration cutoff',inp('psDlLastMin',cd.lastMinuteCutoffDaysBefore,'number'))}
      `)}

      ${section('Special Package Pricing access','Which retreat booking IDs can use the "Special Package Pricing" feature (Builder). Add one per line.',`
        ${row('Booking IDs',`<textarea id="psSpecialPricingIds" rows="3" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;font-family:'Jost',sans-serif">${(s.specialPricingBookingIds||[]).join('\n')}</textarea>`)}
      `)}

      <button onclick="portalSettingsSave()" style="padding:11px 24px;background:var(--teal,#2d6a6a);color:#fff;border:none;border-radius:10px;font-family:'Jost',sans-serif;font-size:13.5px;font-weight:600;cursor:pointer">Save Settings</button>
      <span id="psSaveMsg" style="margin-left:12px;font-size:13px;color:#2d6a6a"></span>
    </div>`;
  // Live-update the On/Off label text next to each toggle
  ['psNotifCheckout','psNotifEscape','psNotifClimas'].forEach(id=>{
    const box=document.getElementById(id);
    box.addEventListener('change',()=>{box.nextElementSibling.textContent=box.checked?'On':'Off';});
  });
}
async function portalSettingsSave(){
  const g=id=>document.getElementById(id).value.trim();
  const nums=(str)=>str.split(',').map(x=>Math.max(0,parseFloat(x.trim())||0));
  const settings={
    spaTransportTaxPct:Math.max(0,parseFloat(g('psSpaTax'))||0),
    roomsInternalTaxPct:Math.max(0,parseFloat(g('psRoomsTax'))||0),
    commissionRatePct:Math.max(0,parseFloat(g('psCommission'))||0),
    holdTtlMinutes:Math.max(1,parseInt(g('psHoldTtl'),10)||1),
    transportRates:{cancun:nums(g('psRateCancun')),tulum:nums(g('psRateTulum'))},
    notifications:{
      checkoutLinksEnabled:document.getElementById('psNotifCheckout').checked,
      escapeWaConfirmEnabled:document.getElementById('psNotifEscape').checked,
      climasReportEnabled:document.getElementById('psNotifClimas').checked,
    },
    contractDeadlines:{
      fullPaymentDaysBefore:Math.max(0,parseInt(g('psDlFullPay'),10)||0),
      cancelDeadlineDaysBefore:Math.max(0,parseInt(g('psDlCancel'),10)||0),
      roomAllotmentReleaseDaysBefore:Math.max(0,parseInt(g('psDlRoomRelease'),10)||0),
      flightDetailsDaysBefore:Math.max(0,parseInt(g('psDlFlight'),10)||0),
      lastMinuteCutoffDaysBefore:Math.max(0,parseInt(g('psDlLastMin'),10)||0),
    },
    specialPricingBookingIds:document.getElementById('psSpecialPricingIds').value.split('\n').map(x=>x.trim()).filter(Boolean),
  };
  if(!settings.transportRates.cancun.length||!settings.transportRates.tulum.length){showToast('Transport rates need at least one number for each airport.');return;}
  try{
    const {error}=await db.from('app_store').upsert({key:'portal_settings',value:settings,updated_at:new Date().toISOString()});
    if(error)throw error;
    PortalSettings={...PORTAL_SETTINGS_DEFAULTS,...settings};
    document.getElementById('psSaveMsg').textContent='Saved ✓';
    setTimeout(()=>{const m=document.getElementById('psSaveMsg');if(m)m.textContent='';},2500);
  }catch(e){showToast('Could not save: '+(e.message||e));}
}
