// ===== group-tips.js — record how much a retreat group left as a tip (Darlene 2026-10-25) =====
// Loaded as a classic script AFTER team-quick-panel.js; shares global scope. Standalone: its own app_store key 'group_tips' = { <bookingId>: { entries:[{ id, amount, currency, note, by, at }] } }.
// Shown from the "💵 Group tip" button (bottom-left, team only) on a retreat: add what the group left (USD or pesos, as many entries as needed, with a note and who recorded it),
// remove a mistaken entry, see the retreat's total, and a list of every retreat's tip below. Team only, teachers never see it. Each save re-reads the stored copy and changes only
// that retreat, so two people recording tips at the same time never overwrite each other.
const GT_KEY = 'group_tips';
const gtState = { data: {}, loaded: false, loading: false };
const gtEsc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const gtMe = () => (typeof getCurrentSession === 'function' && (getCurrentSession() || {}).name) || 'Staff';
const gtMoney = (n, c) => (c === 'MXN' ? 'MX$' : '$') + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + (c === 'MXN' ? ' MXN' : ' USD');
const gtTotals = r => { const t = {}; ((r && r.entries) || []).forEach(e => { t[e.currency] = (t[e.currency] || 0) + Number(e.amount || 0); }); return t; };
const gtTotalText = r => { const t = gtTotals(r), k = Object.keys(t); return k.length ? k.map(c => gtMoney(t[c], c)).join(' + ') : '—'; };
const gtWhen = iso => { try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Cancun' }); } catch (e) { return ''; } };

async function gtLoad() {
  if (gtState.loading) return; gtState.loading = true;
  try { const { data, error } = await db.from('app_store').select('value').eq('key', GT_KEY).maybeSingle(); if (error) throw error; gtState.data = (data && data.value && typeof data.value === 'object') ? data.value : {}; gtState.loaded = true; }
  catch (e) { console.warn('[group-tips]', e); }
  gtState.loading = false; if (typeof qpDraw === 'function') qpDraw();
}
async function gtMutate(bookingId, fn) {
  try {
    const { data } = await db.from('app_store').select('value').eq('key', GT_KEY).maybeSingle();
    const all = (data && data.value && typeof data.value === 'object') ? data.value : {};
    all[bookingId] = all[bookingId] || { entries: [] }; all[bookingId].entries = all[bookingId].entries || [];
    fn(all[bookingId]);
    const { error } = await db.from('app_store').upsert({ key: GT_KEY, value: all, updated_at: new Date().toISOString() }); if (error) throw error;
    gtState.data = all; if (typeof qpDraw === 'function') qpDraw(); return true;
  } catch (e) { showToast('Could not save the tip: ' + (e.message || e)); return false; }
}
function gtAdd(bkId) {
  const amount = parseFloat(String((document.getElementById('gtAmt') || {}).value || '').replace(/,/g, '')), cur = (document.getElementById('gtCur') || {}).value || 'USD', note = ((document.getElementById('gtNote') || {}).value || '').trim();
  if (!(amount > 0)) { showToast('Type how much the group left.'); return; }
  gtMutate(bkId, r => r.entries.push({ id: 'gt' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), amount, currency: cur, note, by: gtMe(), at: new Date().toISOString() })).then(ok => { if (ok) showToast('Tip recorded ✓'); });
}
function gtRemove(bkId, id) {
  if (!confirm('Remove this tip entry?')) return;
  gtMutate(bkId, r => { r.entries = r.entries.filter(e => e.id !== id); });
}
function gtHtml(bk) {
  if (!gtState.loaded && !gtState.loading) gtLoad();
  const rec = gtState.data[bk.id] || { entries: [] };
  const inp = 'padding:8px 10px;border:1.5px solid #c8bfb5;border-radius:8px;font-family:inherit;font-size:13.5px', btn = 'padding:8px 14px;border:1.5px solid #2d6a6a;border-radius:8px;background:#2d6a6a;color:#fff;cursor:pointer;font-family:inherit;font-size:13px;font-weight:700';
  const rows = (rec.entries || []).map((e, i) => `<div style="display:flex;align-items:center;gap:10px;padding:9px 14px;border-top:${i ? '1px solid #f0ebe0' : '0'}"><div style="flex:1"><b>${gtMoney(e.amount, e.currency)}</b>${e.note ? ' · ' + gtEsc(e.note) : ''}<div style="font-size:11.5px;color:#6b7280">Recorded by ${gtEsc(e.by)} · ${gtWhen(e.at)}</div></div><button onclick="gtRemove('${gtEsc(bk.id)}','${gtEsc(e.id)}')" title="Remove" style="border:none;background:none;color:#dc2626;font-size:18px;cursor:pointer">&times;</button></div>`).join('');
  const others = (AppData.bookings || []).filter(b => gtState.data[b.id] && (gtState.data[b.id].entries || []).length).sort((a, b) => String(b.endDate).localeCompare(String(a.endDate)));
  const usd = others.reduce((s, b) => s + (gtTotals(gtState.data[b.id]).USD || 0), 0), mxn = others.reduce((s, b) => s + (gtTotals(gtState.data[b.id]).MXN || 0), 0);
  return `<div style="font-size:12.5px;color:#6b7280;margin-bottom:10px">What this group left for the team as a tip. Add each amount as you count it (dollars or pesos).</div>
    <div style="background:#fff;border:1.5px solid #e8dfd4;border-radius:12px;overflow:hidden;margin-bottom:14px">
      ${rows || '<div style="padding:12px 14px;color:#9ca3af">Nothing recorded yet for this group.</div>'}
      <div style="padding:10px 14px;background:#f0f9f9;border-top:1px solid #e8dfd4;font-weight:700;color:#2d6a6a">Group total: ${gtTotalText(rec)}</div></div>
    <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#a89a86;margin-bottom:6px">Add a tip</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
      <input id="gtAmt" type="number" min="0" step="any" placeholder="Amount" style="${inp};width:130px">
      <select id="gtCur" style="${inp}"><option value="USD">USD ($)</option><option value="MXN">Pesos (MXN)</option></select>
      <input id="gtNote" type="text" placeholder="Note (optional, e.g. envelope on last day)" style="${inp};flex:1;min-width:200px">
      <button onclick="gtAdd('${gtEsc(bk.id)}')" style="${btn}">Add</button></div>
    ${others.length ? `<div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#a89a86;margin:18px 0 6px">All recorded group tips</div>
    <div style="background:#fff;border:1.5px solid #e8dfd4;border-radius:12px;overflow:hidden">${others.map((b, i) => `<div style="display:flex;gap:10px;padding:8px 14px;border-top:${i ? '1px solid #f0ebe0' : '0'};font-size:13px"><div style="flex:1">${gtEsc(b.leaderName || b.retreatName || 'Retreat')}<span style="color:#9ca3af"> · ${gtEsc(String(b.startDate).slice(5, 10))} → ${gtEsc(String(b.endDate).slice(5, 10))}</span></div><b>${gtTotalText(gtState.data[b.id])}</b></div>`).join('')}
      <div style="padding:9px 14px;background:#f0f9f9;border-top:1px solid #e8dfd4;font-weight:700;color:#2d6a6a">All groups: ${[usd ? gtMoney(usd, 'USD') : '', mxn ? gtMoney(mxn, 'MXN') : ''].filter(Boolean).join(' + ') || '—'}</div></div>` : ''}`;
}
