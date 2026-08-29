// ===== activity-sheet.js — extracted from booking-hub.html =====
// Loaded as a classic script; shares global scope with booking-hub.html (same pattern as cb-portal-sync.js).
// Do not add <script type="module"> here — onclick="..." handlers in the HTML rely on plain globals.

// ===== ACTIVITY SHEET TAB =====
let actSheetMonday = null;
let actSheetSignups = {}; // { bookingId: [{firstName,lastName,activities,...}] }
let actOpsData = {}; // { 'aoId|date': {guide, van1, van2, guideConfirmed, driverConfirmed, entranceMXN} }
let actSummaryFilterBkId = '';
let actSummaryShowUndated = false;
const TOUR_GUIDE_NAMES=['Marco','Yolanda','Sergio','Ryan'];
const TOUR_DRIVER_NAMES=['Rubi','Rosy','Kike'];
const TEMAZCAL_FIRE_KEEPER_NAMES=['Golloy','Francisco'];

function actSummarySetFilter(field, val) {
  if (field === 'bkId') actSummaryFilterBkId = val;
  if (field === 'undated') actSummaryShowUndated = (val === true || val === 'true');
  actSheetRenderSummary();
}

function actSheetGetMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (day===0?-6:1-day));
  d.setHours(0,0,0,0);
  return d;
}

async function actSheetInit() {
  if (!actSheetMonday) actSheetMonday = actSheetGetMonday(new Date()).toISOString().split('T')[0];
  await Promise.all([actSheetLoadSignups(), actOpsLoad()]);
  actSheetSetView('summary');
}

function actSheetGoToday() {
  actSheetMonday = actSheetGetMonday(new Date()).toISOString().split('T')[0];
  actSheetRenderWeek();
}

function actSheetNavWeek(dir) {
  const d = new Date(actSheetMonday+'T12:00:00');
  d.setDate(d.getDate()+dir*7);
  actSheetMonday = d.toISOString().split('T')[0];
  actSheetRenderWeek();
}
function actSheetJumpTo(dateStr) {
  if (!dateStr) return;
  actSheetMonday = actSheetGetMonday(new Date(dateStr+'T12:00:00')).toISOString().split('T')[0];
  actSheetSetView('week');
  actSheetRenderWeek();
}

async function actSheetLoadSignups() {
  // Method 1: explicit lookup for all known non-cancelled bookings
  try {
    const keys = AppData.bookings.filter(b=>b.status!=='cancelled').map(b=>'act_signups_'+b.id);
    if (keys.length) {
      const {data} = await db.from('app_store').select('key,value').in('key', keys);
      if (data) data.forEach(row => {
        actSheetSignups[row.key.replace('act_signups_','')] = row.value || [];
      });
    }
  } catch(e) {}
  // Method 2: sweep ALL sign-up keys to catch anything not in local bookings list
  try {
    const {data} = await db.from('app_store').select('key,value').ilike('key','act_signups_%');
    if (data) data.forEach(row => {
      const bkId = row.key.replace('act_signups_','');
      if (!actSheetSignups[bkId] || !actSheetSignups[bkId].length)
        actSheetSignups[bkId] = row.value || [];
    });
  } catch(e) {}
}

async function actSheetPopulate() {
  showToast('Loading sign-ups...');
  await actSheetLoadSignups();
  actSheetRenderWeek();
  actSheetRenderSummary();
  showToast('Activity sheet refreshed');
}

function actSheetCopyLink(bkId) {
  const url = 'https://amansala-portal.netlify.app/activity-signup.html?id='+bkId;
  navigator.clipboard.writeText(url).then(()=>showToast('Sign-up link copied!')).catch(()=>{
    const ta=document.createElement('textarea');ta.value=url;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);showToast('Sign-up link copied!');
  });
}

function actSheetRenderWeek() {
  const grid = document.getElementById('actSheetGrid');
  if (!grid) return;

  const weekStart = new Date(actSheetMonday+'T12:00:00');
  const days = [];
  for (let i=0;i<7;i++){const d=new Date(weekStart);d.setDate(d.getDate()+i);days.push(d.toISOString().split('T')[0]);}
  const wFirst=days[0], wLast=days[6];
  const today = new Date().toISOString().split('T')[0];

  // Update label
  const wEnd=new Date(weekStart);wEnd.setDate(wEnd.getDate()+6);
  const lbl=document.getElementById('actSheetWeekLabel');
  if(lbl){const f=d=>d.toLocaleDateString('en-US',{month:'short',day:'numeric'});lbl.textContent=f(weekStart)+' – '+f(wEnd)+', '+weekStart.getFullYear();}

  const aoMap={};(ADD_ONS||[]).forEach(a=>aoMap[a.id]=a);

  // Build per-day activity list with sign-up counts
  // Structure: { date: [ {activity, booking, signups:[], prepaid} ] }
  const dayActs = {};
  days.forEach(ds=>dayActs[ds]=[]);

  AppData.bookings.filter(b=>b.status!=='cancelled').forEach(bk=>{
    const s=(bk.startDate||'').slice(0,10), e=(bk.endDate||'').slice(0,10);
    if(!s||!e||s>wLast||e<wFirst) return;
    const sups = actSheetSignups[bk.id]||[];
    (bk.retreatActivities||[]).forEach(act=>{
      const ds=(act.date||'').slice(0,10);
      if(!ds||!dayActs[ds]) return;
      const ao=aoMap[act.aoId]||{name:act.aoId,price:0,dur:0};
      // guests signed up for this activity
      const signedUp = sups.filter(s=>(s.activities||[]).includes(act.aoId))
        .map(s=>({first:s.firstName||'',last:s.lastName||''}))
        .sort((a,b)=>a.last.localeCompare(b.last)||a.first.localeCompare(b.first));
      dayActs[ds].push({
        aoId:act.aoId, ao, time:act.time||'', prepaid:!!act.prepaid,
        bkName:bk.leaderName||bk.retreatName||'Group', bkId:bk.id,
        pax:bk.pax||0, signedUp
      });
    });
  });

  // Sort each day by time
  days.forEach(ds=>dayActs[ds].sort((a,b)=>a.time<b.time?-1:a.time>b.time?1:0));

  const fmtT=t=>{if(!t)return'TBD';const[h,m]=t.split(':').map(Number);return((h%12)||12)+':'+String(m).padStart(2,'0')+(h>=12?' PM':' AM');};
  const fmtDur=m=>{if(!m)return'';const h=Math.floor(m/60),r=m%60;return h?(h+(r?'.5':'')+'hr'):(r+'min');};

  const hasAny = days.some(ds=>dayActs[ds].length>0);

  // Render as day columns
  let html='<div style="min-width:980px"><div style="display:grid;grid-template-columns:repeat(7,minmax(160px,1fr));gap:1px;background:#d4cfca;border:1px solid #d4cfca;border-radius:12px;overflow:hidden">';

  // Headers
  days.forEach(ds=>{
    const d=new Date(ds+'T12:00:00');
    const isToday=ds===today;
    html+=`<div style="background:${isToday?'var(--teal,#2d6a6a)':'#1a2332'};color:#fff;padding:10px 8px;text-align:center">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.9px;opacity:.75">${d.toLocaleDateString('en-US',{weekday:'long'})}</div>
      <div style="font-size:14px;font-weight:600;margin-top:2px">${d.toLocaleDateString('en-US',{month:'short',day:'numeric'})}</div>
    </div>`;
  });

  // Day cells
  days.forEach(ds=>{
    const acts=dayActs[ds];
    let cell='<div style="background:#fff;min-height:120px;padding:6px 6px 10px;">';
    if(!acts.length){
      cell+='<div style="font-size:11px;color:#c8bfb5;padding:12px 6px;text-align:center;font-style:italic">No activities</div>';
    } else {
      const prepaid=acts.filter(a=>a.prepaid), optional=acts.filter(a=>!a.prepaid);
      if(prepaid.length){
        cell+='<div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#15803d;background:#dcfce7;padding:3px 6px;margin-bottom:4px;border-radius:4px">✦ Pre-Paid</div>';
        prepaid.forEach(a=>{ cell+=actSheetActCard(a,fmtT,fmtDur,true); });
      }
      if(optional.length){
        cell+=`<div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#1d4ed8;background:#dbeafe;padding:3px 6px;margin:${prepaid.length?'8px 0':'0'} 0 4px;border-radius:4px">Optional</div>`;
        optional.forEach(a=>{ cell+=actSheetActCard(a,fmtT,fmtDur,false); });
      }
    }
    cell+='</div>';
    html+=cell;
  });

  html+='</div>';

  // Link panel — active retreats this week with copy-link buttons
  const weekRetreats=AppData.bookings.filter(b=>{
    if(b.status==='cancelled') return false;
    const s=(b.startDate||'').slice(0,10),e=(b.endDate||'').slice(0,10);
    return s&&e&&s<=wLast&&e>=wFirst&&(b.retreatActivities||[]).some(a=>!a.prepaid);
  });

  if(weekRetreats.length){
    html+=`<div style="margin-top:16px;background:#fff;border:1px solid var(--border);border-radius:12px;padding:16px 20px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--teal,#2d6a6a);margin-bottom:12px">Share Sign-Up Links</div>
      ${weekRetreats.map(bk=>{
        const sups=(actSheetSignups[bk.id]||[]).length;
        const supColor=sups>0?'#059669':'#9ca3af';
        return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f0ebe0;flex-wrap:wrap">
          <div style="flex:1;min-width:160px">
            <div style="font-size:13px;font-weight:600;color:var(--dark)">${bk.leaderName||bk.retreatName||'Group'}</div>
            <div style="font-size:11px;color:var(--muted)">${(bk.startDate||'').slice(0,10)} – ${(bk.endDate||'').slice(0,10)}</div>
          </div>
          <span style="font-size:12px;font-weight:700;color:${supColor};background:${supColor}18;border:1.5px solid ${supColor}44;border-radius:20px;padding:2px 10px;white-space:nowrap">${sups} signed up</span>
          <button onclick="actAdminAddSignup('${bk.id}')" style="padding:5px 10px;font-size:11px;font-weight:600;background:#fef3c7;color:#92400e;border:1.5px solid #fcd34d;border-radius:7px;cursor:pointer;font-family:'Jost',sans-serif;white-space:nowrap">+ Add Sign-Up</button>
          <button onclick="actSheetCopyLink('${bk.id}')" style="padding:5px 10px;font-size:11px;font-weight:600;background:#f0f9f9;color:var(--teal,#2d6a6a);border:1.5px solid #b2d8d8;border-radius:7px;cursor:pointer;font-family:'Jost',sans-serif;white-space:nowrap">🔗 Copy Link</button>
        </div>`;
      }).join('')}
    </div>`;
  }

  if(!hasAny) html+='<div style="text-align:center;padding:32px;color:#9ca3af;font-family:\'Jost\',sans-serif;font-size:13px">No activities scheduled this week. Assign activities to bookings in the <b>Venues</b> tab, then click <b>Refresh Sign-Ups</b>.</div>';

  html+='</div>';
  grid.innerHTML=html;
}

function actSheetActCard(a, fmtT, fmtDur, isPrepaid) {
  const border=isPrepaid?'#059669':'#3b82f6';
  const bg=isPrepaid?'#f0fdf4':'#eff6ff';
  const guests=a.signedUp.length;
  const guestList=a.signedUp.slice(0,4).map(g=>`${g.last}, ${g.first}${g.room?` <span style="color:#9ca3af">(Rm ${g.room})</span>`:''}`).join('<br>');
  const more=a.signedUp.length>4?`<span style="color:#9ca3af">+${a.signedUp.length-4} more</span>`:'';
  return `<div style="border-left:3px solid ${border};background:${bg};padding:5px 7px;margin-bottom:5px;border-radius:0 5px 5px 0">
    ${a.time?`<div style="font-size:10px;font-weight:700;color:#374151">${fmtT(a.time)}${a.ao.dur?' · '+fmtDur(a.ao.dur):''}</div>`:''}
    <div style="font-size:11px;font-weight:700;color:#1a2332;line-height:1.3;margin:1px 0">${a.ao.name}</div>
    <div style="font-size:10px;color:#6b7280">${a.bkName}${a.ao.price&&!isPrepaid?' · $'+a.ao.price+'/pp':''}</div>
    ${guests?`<div style="margin-top:4px;padding-top:4px;border-top:1px dotted ${border}40">
      <div style="font-size:9.5px;font-weight:700;color:${border};margin-bottom:2px">${guests} signed up</div>
      <div style="font-size:9.5px;color:#374151;line-height:1.5">${guestList}${more?'<br>'+more:''}</div>
    </div>`:'<div style="font-size:9.5px;color:#c8bfb5;margin-top:3px;font-style:italic">No sign-ups yet</div>'}
  </div>`;
}

let actSheetView = 'week';

function actSheetSetView(v) {
  actSheetView = v;
  document.getElementById('actViewWeek').style.background = v==='week' ? 'var(--teal,#2d6a6a)' : '#fff';
  document.getElementById('actViewWeek').style.color = v==='week' ? '#fff' : 'var(--dark)';
  document.getElementById('actViewSummary').style.background = v==='summary' ? 'var(--teal,#2d6a6a)' : '#fff';
  document.getElementById('actViewSummary').style.color = v==='summary' ? '#fff' : 'var(--dark)';
  document.getElementById('actViewByRetreat').style.background = v==='byretreat' ? 'var(--teal,#2d6a6a)' : '#fff';
  document.getElementById('actViewByRetreat').style.color = v==='byretreat' ? '#fff' : 'var(--dark)';
  document.getElementById('actViewImport').style.background = v==='import' ? 'var(--teal,#2d6a6a)' : '#fff';
  document.getElementById('actViewImport').style.color = v==='import' ? '#fff' : 'var(--dark)';
  document.getElementById('actSheetGrid').style.display = v==='week' ? '' : 'none';
  document.getElementById('actSheetSummary').style.display = v==='summary' ? '' : 'none';
  document.getElementById('actSheetByRetreat').style.display = v==='byretreat' ? '' : 'none';
  document.getElementById('actSheetImport').style.display = v==='import' ? '' : 'none';
  if (v==='summary') actSheetRenderSummary();
  if (v==='byretreat') actByRetreatRender();
  if (v==='import' && typeof aiRender==='function') aiRender();
}

// ===== BY-RETREAT ACTIVITY SHEET =====
// The classic paper sign-up sheet, automated: pick a retreat, see (and print)
// one clean sheet per activity — date, time, price, and every guest's name in
// alphabetical order. Optional add-ons pull names from online sign-ups (with a
// few blank lines for walk-ins); activities included in the package pull the
// full room-list roster since every guest in the package attends.
let actByRetreatBkId = '';

function actRosterForBk(bkId) {
  const list = [];
  (AppData.regs||[]).filter(r=>r.bookingId===bkId&&!r.isTeacherRoom).forEach(r=>{
    (r.guests||[]).forEach(g=>{
      if (!g.name) return;
      const parts = g.name.trim().split(/\s+/);
      const first = parts[0]||'';
      const last = parts.length>1 ? parts.slice(1).join(' ') : '';
      list.push({first, last, room:r.room||''});
    });
  });
  return list.sort((a,b)=>(a.last||a.first).localeCompare(b.last||b.first)||a.first.localeCompare(b.first));
}

function actByRetreatBuildEntries(bkId) {
  const bk = AppData.bookings.find(b=>b.id===bkId); if (!bk) return [];
  const aoMap = {}; (ADD_ONS||[]).forEach(a=>aoMap[a.id]=a);
  const sups = actSheetSignups[bkId]||[];
  const roster = actRosterForBk(bkId);
  const seen = new Set();
  const entries = (bk.retreatActivities||[]).filter(a=>{
    if (!a.aoId) return false;
    const key = a.aoId+'|'+(a.date||'');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(a=>{
    const ao = aoMap[a.aoId]||{name:a.aoId,price:0};
    // Every retreat guest — pulled straight from the room list — appears on
    // every activity's sheet. Prepaid activities mark everyone as attending;
    // optional ones mark only whoever already signed up online, leaving the
    // rest as open checkboxes for a walk-in paper sign-up.
    const signedNames = new Set(sups.filter(s=>(s.activities||[]).includes(a.aoId))
      .map(s=>((s.firstName||'')+' '+(s.lastName||'')).trim().toLowerCase()));
    const guests = roster.map(g=>({...g, signedUp: a.prepaid || signedNames.has((g.first+' '+g.last).trim().toLowerCase())}));
    return {ao, date:a.date||'', time:a.time||'', prepaid:!!a.prepaid, guests};
  });
  entries.sort((a,b)=>(b.prepaid-a.prepaid)||(a.date||'9999').localeCompare(b.date||'9999')||(a.time||'99:99').localeCompare(b.time||'99:99'));
  return entries;
}

function actByRetreatSelect(bkId) {
  actByRetreatBkId = bkId;
  actByRetreatRender();
}
function actByRetreatSearchPick(typed) {
  const fmtD = ds=>{if(!ds)return'';const d=new Date(ds+'T12:00:00');return d.toLocaleDateString('en-US',{month:'short',day:'numeric'});};
  const retreatLabel = b=>`${b.retreatName||b.leaderName||'Retreat'}${b.startDate?' · '+fmtD(b.startDate)+' – '+fmtD(b.endDate):''}`;
  const bks = AppData.bookings.filter(b=>b.status!=='cancelled');
  const match = bks.find(b=>retreatLabel(b)===typed);
  if (match) actByRetreatSelect(match.id); // only jumps once the typed text exactly matches a real retreat
}

function actByRetreatRender() {
  const wrap = document.getElementById('actSheetByRetreat');
  if (!wrap) return;
  const bks = AppData.bookings.filter(b=>b.status!=='cancelled').slice().sort((a,b)=>(b.startDate||'').localeCompare(a.startDate||''));
  if (!actByRetreatBkId || !bks.some(b=>b.id===actByRetreatBkId)) {
    const today = new Date().toISOString().slice(0,10);
    const upcoming = bks.filter(b=>(b.endDate||'')>=today).sort((a,b)=>(a.startDate||'').localeCompare(b.startDate||''))[0];
    actByRetreatBkId = (upcoming||bks[0])?.id||'';
  }
  const fmtD = ds=>{if(!ds)return'';const d=new Date(ds+'T12:00:00');return d.toLocaleDateString('en-US',{month:'short',day:'numeric'});};
  const retreatLabel = b=>`${b.retreatName||b.leaderName||'Retreat'}${b.startDate?' · '+fmtD(b.startDate)+' – '+fmtD(b.endDate):''}`;
  const selected = bks.find(b=>b.id===actByRetreatBkId);
  const dlOpts = bks.map(b=>`<option value="${menuEsc(retreatLabel(b))}">`).join('');

  let html = `<div style="max-width:900px">
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:18px;padding:14px 18px;background:#fff;border:1px solid var(--border);border-radius:10px">
      <span style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.4px">Retreat</span>
      <input list="actByRetreatDatalist" value="${selected?menuEsc(retreatLabel(selected)):''}" placeholder="Search by name…" oninput="actByRetreatSearchPick(this.value)" style="flex:1;min-width:220px;max-width:420px;padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;font-family:'Jost',sans-serif;font-size:13.5px;color:var(--dark);background:#fff">
      <datalist id="actByRetreatDatalist">${dlOpts||''}</datalist>
      <button onclick="actByRetreatPrint(actByRetreatBkId)" style="display:flex;align-items:center;gap:6px;padding:8px 16px;background:var(--teal,#2d6a6a);color:#fff;border:none;border-radius:8px;font-family:'Jost',sans-serif;font-size:13px;font-weight:600;cursor:pointer">🖨 Print Activity Sheet</button>
    </div>`;

  if (!actByRetreatBkId) {
    html += '<div style="text-align:center;padding:40px;color:#9ca3af;font-size:13px">No retreats found.</div></div>';
    wrap.innerHTML = html;
    return;
  }

  const entries = actByRetreatBuildEntries(actByRetreatBkId);
  if (!entries.length) {
    html += '<div style="text-align:center;padding:40px;color:#9ca3af;font-size:13px">No activities scheduled for this retreat yet. Assign activities in the <b>Venues</b> tab.</div>';
  } else {
    const fmtDLong = ds=>{if(!ds)return'Date TBD';const d=new Date(ds+'T12:00:00');return d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});};
    const fmtT = t=>{if(!t)return'Time TBD';const[h,m]=t.split(':').map(Number);return((h%12)||12)+':'+String(m).padStart(2,'0')+(h>=12?' PM':' AM');};
    const renderCard = e=>{
      const border = e.prepaid?'#059669':'#3b82f6';
      const bg = e.prepaid?'#f0fdf4':'#eff6ff';
      const priceTxt = e.prepaid?'Included':(e.ao.price?'$'+e.ao.price+'/person':'');
      const signedCount = e.guests.filter(g=>g.signedUp).length;
      const guestList = e.guests.map((g,i)=>{
        const box = e.prepaid ? '' : `<span style="display:inline-block;width:13px;height:13px;border:1.5px solid ${g.signedUp?'#059669':'#c8bfb5'};border-radius:3px;background:${g.signedUp?'#059669':'#fff'};margin-right:7px;vertical-align:middle;text-align:center;line-height:12px;font-size:10px;color:#fff">${g.signedUp?'✓':''}</span>`;
        return `<div style="font-size:12.5px;color:var(--dark);padding:2px 0">${box}${g.last?g.last+', '+g.first:g.first}${g.room?` <span style="color:#9ca3af;font-size:11px">(Rm ${g.room})</span>`:''}</div>`;
      }).join('');
      return `<div style="background:#fff;border:1px solid var(--border);border-radius:10px;margin-bottom:12px;overflow:hidden">
        <div style="background:${bg};border-bottom:1px solid ${border}30;padding:12px 18px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
          <div>
            <div style="font-size:14.5px;font-weight:700;color:var(--dark)">${e.ao.name}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:2px">${fmtDLong(e.date)} · ${fmtT(e.time)}${!e.prepaid?' · '+signedCount+' of '+e.guests.length+' signed up':''}</div>
          </div>
          <div style="font-size:13px;font-weight:700;color:${e.prepaid?'#059669':'#7c3aed'}">${priceTxt}</div>
        </div>
        <div style="padding:12px 18px">
          ${guestList||'<div style="font-size:12px;color:#c8bfb5;font-style:italic">No guests on the room list yet.</div>'}
        </div>
      </div>`;
    };
    const sectionHdr = txt=>`<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#6b7280;margin:18px 0 8px">${txt}</div>`;
    const prepaidEntries = entries.filter(e=>e.prepaid);
    const optionalEntries = entries.filter(e=>!e.prepaid);
    if (prepaidEntries.length) html += sectionHdr('✦ Included in the Package') + prepaidEntries.map(renderCard).join('');
    if (optionalEntries.length) html += sectionHdr('Optional Add-Ons — Sign Up') + optionalEntries.map(renderCard).join('');
  }
  html += '</div>';
  wrap.innerHTML = html;
}

function actByRetreatPrint(bkId) {
  const bk = AppData.bookings.find(b=>b.id===bkId);
  if (!bk) { showToast('Select a retreat first.'); return; }
  // Chronological (not prepaid-first) — this is a sign-up grid organized by
  // when each activity actually happens, matching the paper sheet this
  // replaces: one column per tour/ceremony occurrence, one row per guest.
  const entries = actByRetreatBuildEntries(bkId).slice().sort((a,b)=>(a.date||'').localeCompare(b.date||'')||(a.time||'').localeCompare(b.time||''));
  const retreatName = bk.leaderName||bk.retreatName||'Retreat';

  const ordinal = n=>{const s=['th','st','nd','rd'],v=n%100;return n+(s[(v-20)%10]||s[v]||s[0]);};
  const startD = new Date(bk.startDate+'T12:00:00'), endD = new Date(bk.endDate+'T12:00:00');
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dateRangeLbl = startD.getMonth()===endD.getMonth()
    ? MON[startD.getMonth()]+' '+ordinal(startD.getDate())+' - '+ordinal(endD.getDate())
    : MON[startD.getMonth()]+' '+ordinal(startD.getDate())+' - '+MON[endD.getMonth()]+' '+ordinal(endD.getDate());
  const fmtDay = ds=>{const d=new Date(ds+'T12:00:00');return d.toLocaleDateString('en-US',{weekday:'long'});};
  const fmtDate = ds=>{const d=new Date(ds+'T12:00:00');return MON[d.getMonth()]+' '+ordinal(d.getDate());};
  const fmtT = t=>{if(!t)return'';const[h,m]=t.split(':').map(Number);return((h%12)||12)+':'+String(m).padStart(2,'0')+' '+(h>=12?'pm':'am');};
  // Room-list names are entered inconsistently (all-lowercase, etc.) — always
  // title-case each word so the printed sheet reads properly regardless.
  const titleCase = s=>(s||'').trim().split(/\s+/).filter(Boolean).map(w=>w.charAt(0).toUpperCase()+w.slice(1).toLowerCase()).join(' ');

  // Full roster, alphabetical by first name (matching the paper sheet this
  // replaces) — every guest gets a row whether or not they've signed up for
  // anything yet. This is the physical, pen-and-paper sheet — every mark
  // cell prints blank regardless of online sign-ups, so guests can write
  // their own X at check-in; the completed sheet later gets reconciled via
  // Import Sheet. (The on-screen By Retreat view still shows who's already
  // signed up online — only the print output stays blank.)
  const roster = actRosterForBk(bkId).slice().sort((a,b)=>a.first.localeCompare(b.first)||(a.last||'').localeCompare(b.last||''));

  const addMin = (t,mins)=>{if(!t)return'';const[h,m]=t.split(':').map(Number);const tot=h*60+m+mins;const hh=Math.floor(tot/60)%24;return`${String(hh).padStart(2,'0')}:${String(tot%60).padStart(2,'0')}`;};
  const fmtRange = (start,end)=>{
    if(!start)return'';
    const parts=t=>{const[h,m]=t.split(':').map(Number);return{h12:(h%12)||12,m:String(m).padStart(2,'0')};};
    const a=parts(start), b=parts(end);
    return `${a.h12}:${a.m} – ${b.h12}:${b.m}`;
  };
  // Shortened labels for the print header only — the full names (used
  // everywhere else in the app) stay as-is in ADD_ONS.
  const ACT_SHEET_SHORT_NAMES = {ao4:'Sound Healing', ao9:'Mayan Clay'};
  const colHeaders = entries.map(e=>{
    const priceTxt = e.prepaid ? 'Included' : (e.ao.price?'$'+e.ao.price:'');
    const displayName = ACT_SHEET_SHORT_NAMES[e.ao.id] || e.ao.name;
    const nameTxt = e.prepaid ? displayName : `<span class="col-optional-tag">Optional</span>${displayName}`;
    const dur = (typeof ACTS_DUR!=='undefined'&&ACTS_DUR[e.ao.id])||90;
    const timeTxt = e.time ? fmtRange(e.time,addMin(e.time,dur)) : '';
    return `<th>
      <div class="col-day">${fmtDay(e.date)}</div>
      <div class="col-date">${fmtDate(e.date)}</div>
      <div class="col-name">${nameTxt}</div>
      <div class="col-time">${timeTxt}</div>
      <div class="col-price">${priceTxt}</div>
    </th>`;
  }).join('');

  const guestRows = roster.map(g=>{
    // Included activities are already part of everyone's package, so they're
    // pre-marked — guests only need to mark the optional/paid columns.
    const cells = entries.map(e=>`<td class="mark"><span class="box${e.prepaid?' checked':''}">${e.prepaid?'✓':''}</span></td>`).join('');
    const first=titleCase(g.first), last=titleCase(g.last);
    return `<tr><td class="name-cell">${first}${last?' '+last:''}</td>${cells}</tr>`;
  }).join('');

  // Staff-only info (headcount tally, guide/driver assignments) lives in its
  // own small panel below the guest grid rather than embedded as extra rows
  // in the sign-up table — keeps the part guests actually read clean, and
  // reads as a considered, separate "for staff use" reference the way a
  // boutique property's ops sheet would. Printed blank on purpose — staff
  // write the assignment in by hand rather than it being pre-filled from
  // whatever the Operations panel happens to hold at print time.
  const opsPanelRow = (label)=>`<tr><td class="ops-label">${label}</td>${entries.map(()=>
    `<td><span class="write-line"></span></td>`
  ).join('')}</tr>`;
  const opsPanel = entries.length ? `<div class="ops-panel">
      <div class="ops-panel-title">For Staff Use</div>
      <table>
        ${opsPanelRow('Guide 1')}
        ${opsPanelRow('Guide 2')}
        ${opsPanelRow('Van')}
      </table>
    </div>` : '';

  const signupLink = location.origin+'/activity-signup.html?id='+bkId;

  const win = window.open('','_blank');
  win.document.write(`<!DOCTYPE html><html><head>
    <link rel="icon" type="image/png" href="/favicon.png"><title>Activity Sheet · ${retreatName}</title>
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Jost:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
      *{box-sizing:border-box}
      body{font-family:'Jost',sans-serif;margin:0;padding:44px 48px;color:#2d2520;background:#fdfbf7;font-size:14pt;line-height:1.5}
      .print-btn{padding:9px 20px;background:#2d6a6a;color:#fff;border:none;border-radius:8px;cursor:pointer;font-family:'Jost',sans-serif;font-size:13pt;font-weight:600;float:right;margin-bottom:18px}
      .hdr{text-align:center;margin-bottom:8px}
      .logo-mark{height:56px;margin-bottom:8px}
      .title{font-family:'Cormorant Garamond',serif;font-size:32pt;font-weight:700;color:#1a2332;margin-bottom:6px;clear:both;letter-spacing:.3px}
      .sub{font-size:12.5pt;letter-spacing:2px;color:#a89a86;text-transform:uppercase;margin-bottom:20px}
      .divider{width:54px;height:1px;background:#c9a876;margin:0 auto 22px;position:relative}
      .divider::before{content:'';position:absolute;left:50%;top:-3px;transform:translateX(-50%);width:5px;height:5px;border-radius:50%;background:#c9a876}
      .instr{font-size:13.5pt;font-weight:500;font-style:italic;color:#6b5f52;margin-bottom:14px}
      .meta-row{display:flex;justify-content:center;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:8px}
      .warn-pill{display:inline-block;font-size:11.5pt;font-weight:600;letter-spacing:.3px;color:#a05a35;background:transparent;border:1px solid #d9b696;border-radius:99px;padding:5px 18px}
      .pax-pill{display:inline-block;font-size:11.5pt;font-weight:600;letter-spacing:.3px;color:#1e4f4f;background:transparent;border:1px solid #9cc9c2;border-radius:99px;padding:5px 18px}
      table{width:100%;border-collapse:collapse;font-size:14pt;margin-top:30px}
      th{border-bottom:2px solid #2d6a6a;border-top:none;border-left:none;border-right:none;padding:10px 6px 12px;font-size:11.5pt;font-weight:700;vertical-align:top;min-width:96px;font-family:'Jost',sans-serif;background:#f4efe4;color:#1e4f4f}
      th:first-child{background:#efe8d8}
      .col-day{font-size:9pt;text-transform:uppercase;letter-spacing:1px;color:#a89a86;font-weight:600}
      .col-date{font-size:12pt;font-family:'Cormorant Garamond',serif;font-weight:700;color:#1a2332}
      .col-name{margin-top:6px;font-weight:600;font-size:11pt;line-height:1.35;color:#2d6a6a}
      .col-optional-tag{display:block;font-size:8.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#a89a86}
      .col-time{margin-top:4px;font-size:9.5pt;color:#8a7e74;white-space:nowrap}
      .col-price{margin-top:4px;font-size:10.5pt;color:#8a7e74}
      .col-price{color:#a05a35;font-weight:600}
      td{border-bottom:1px solid #ece4d4;padding:9px 9px;font-size:13pt}
      td.name-cell{font-weight:500;white-space:nowrap;text-align:left;font-family:'Cormorant Garamond',serif;font-size:14.5pt;color:#1a2332}
      tbody tr:nth-child(even){background:#faf7f0}
      td.mark{text-align:center}
      td.mark .box{display:inline-block;width:16px;height:16px;border:1.5px solid #cabfaa;border-radius:4px}
      td.mark .box.checked{display:inline-flex;align-items:center;justify-content:center;background:#eef5f0;border-color:#2d6a6a;color:#2d6a6a;font-size:12px;font-weight:700;line-height:1}
      .ops-panel{margin-top:26px;border:1px solid #e8dfd0;border-radius:10px;overflow:hidden}
      .ops-panel-title{font-size:9.5pt;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:#a89a86;background:#f4efe4;padding:9px 16px;border-bottom:1px solid #e8dfd0}
      .ops-panel table{margin-top:0;font-size:11.5pt}
      .ops-panel td{border-bottom:1px solid #ece4d4;padding:7px 9px;font-size:11pt;color:#4a4038}
      .write-line{display:block;width:100%;min-width:70px;height:1px;background:#cabfaa;margin-top:14px}
      .ops-panel tr:last-child td{border-bottom:none}
      .ops-label{font-weight:700;color:#1e4f4f;background:#faf7f0;white-space:nowrap;font-size:10.5pt;text-transform:uppercase;letter-spacing:.4px}
      .footer{text-align:center;font-size:11pt;color:#4a7070;margin-top:30px;line-height:1.8}
      .footer a{color:#2d6a6a;font-weight:600}
      .footer .policy{color:#a89a86;font-style:italic}
      @media print{.no-print{display:none}body{padding:22px 26px}}
    </style>
  </head><body>
    <button class="print-btn no-print" onclick="window.print()">Print</button>
    <div class="hdr">
      <img class="logo-mark" src="/logo-amansala.png" alt="Amansala">
      <div class="title">${retreatName}</div>
      <div class="sub">${dateRangeLbl}</div>
      <div class="divider"></div>
      <div class="instr">Please mark an X by your name if you will participate in the activities</div>
      <div class="meta-row">
        <span class="warn-pill">Minimum of 6 people required</span>
        <span class="pax-pill">${roster.length} guests total</span>
      </div>
    </div>
    <table>
      <tr><th style="text-align:left">Name</th>${colHeaders}</tr>
      ${guestRows||`<tr><td class="name-cell" colspan="${entries.length+1}" style="text-align:center;font-style:italic">No guests on the room list yet.</td></tr>`}
    </table>
    ${opsPanel}
    <div class="footer">
      <span class="policy">All services must be cancelled at least 12 hours before your service otherwise you will be charged for it.</span>
    </div>
  </body></html>`);
  win.document.close();
  setTimeout(()=>win.print(), 400);
}

function actSheetRenderSummary() {
  const el = document.getElementById('actSheetSummary');
  if (!el) return;
  const aoMap = {}; (ADD_ONS||[]).forEach(a => aoMap[a.id]=a);
  const fmtT = t => {if(!t)return'TBD';const[h,m]=t.split(':').map(Number);return((h%12)||12)+':'+String(m).padStart(2,'0')+(h>=12?' PM':' AM');};
  const fmtD = ds => {if(!ds)return'';const d=new Date(ds+'T12:00:00');return d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});};
  const fmtDur = m => {if(!m)return'';const h=Math.floor(m/60),r=m%60;return h+(r?'.5':'')+'hr';};
  const MIN_GROUP = 8;

  // Collect per-group entries, then combine by aoId+date
  const groupMap = {}; // key: aoId+'|'+date → {ao, date, time, prepaid, groups:[{bkName,bkId,pax,signedUp}]}
  AppData.bookings.filter(b=>b.status!=='cancelled').forEach(bk=>{
    const sups = actSheetSignups[bk.id]||[];
    const scheduledAoIds = new Set((bk.retreatActivities||[]).map(a=>a.aoId));
    // Existing scheduled activities
    (bk.retreatActivities||[]).forEach(act=>{
      const ao = aoMap[act.aoId]||{name:act.aoId,price:0,dur:0};
      const key = act.aoId+'|'+(act.date||'');
      const signedUp = sups.filter(s=>(s.activities||[]).includes(act.aoId))
        .map(s=>({first:s.firstName||'',last:s.lastName||'',room:s.roomNumber||'',bkId:bk.id}))
        .sort((a,b)=>a.last.localeCompare(b.last)||a.first.localeCompare(b.first));
      if (!groupMap[key]) groupMap[key]={ao, date:act.date||'', time:act.time||'', prepaid:!!act.prepaid, groups:[]};
      groupMap[key].groups.push({bkName:bk.retreatName||bk.leaderName||'Group', bkId:bk.id, pax:bk.pax||0, signedUp});
    });
    // Packages not yet scheduled — show with no date so admin can set one
    (bk.packages||[]).forEach(aoId=>{
      if (scheduledAoIds.has(aoId)) return;
      const ao = aoMap[aoId]; if (!ao) return;
      const key = aoId+'|__unscheduled__'+bk.id;
      groupMap[key]={ao, date:'', time:'', prepaid:true, groups:[{bkName:bk.retreatName||bk.leaderName||'Group', bkId:bk.id, pax:bk.pax||0, signedUp:[]}]};
    });
    // Safety net: surface any sign-ups for activities NOT in retreatActivities (e.g. activity removed after sign-up)
    sups.forEach(s=>{
      (s.activities||[]).forEach(aoId=>{
        if (scheduledAoIds.has(aoId)) return;
        const ao = aoMap[aoId]; if (!ao) return;
        const key = aoId+'|__orphan__'+bk.id;
        if (!groupMap[key]) groupMap[key]={ao, date:'', time:'', prepaid:false, groups:[], orphan:true};
        let grp = groupMap[key].groups.find(g=>g.bkId===bk.id);
        if (!grp) { grp={bkName:bk.retreatName||bk.leaderName||'Group', bkId:bk.id, pax:bk.pax||0, signedUp:[]}; groupMap[key].groups.push(grp); }
        if (!grp.signedUp.find(x=>x.first===s.firstName&&x.last===s.lastName))
          grp.signedUp.push({first:s.firstName||'',last:s.lastName||'',room:s.roomNumber||'',bkId:bk.id});
      });
    });
  });

  const entries = Object.values(groupMap).sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:a.time<b.time?-1:1);
  // Build a map of aoId → existing dates (from OTHER entries) for quick-pick suggestions
  const aoDateSuggestions = {};
  entries.forEach(e=>{
    if (!e.date) return;
    if (!aoDateSuggestions[e.ao.id]) aoDateSuggestions[e.ao.id]=[];
    const label=fmtD(e.date)+(e.time?' · '+fmtT(e.time):'');
    if (!aoDateSuggestions[e.ao.id].find(s=>s.date===e.date))
      aoDateSuggestions[e.ao.id].push({date:e.date,time:e.time||'',label});
  });

  if (!entries.length) {
    el.innerHTML='<div style="text-align:center;padding:40px;color:#9ca3af;font-size:13px">No activities found. Assign activities to bookings in the <b>Venues</b> tab.</div>';
    return;
  }

  // Update badge count (total across ALL entries before filtering)
  const totalSignups = entries.reduce((n,e)=>n+e.groups.reduce((m,g)=>m+g.signedUp.length,0),0);
  const badge = document.getElementById('actSignupBadge');
  if (badge) { badge.textContent=totalSignups; badge.style.display=totalSignups?'inline':'none'; }

  // Apply filters
  let filteredEntries = entries;
  if (actSummaryFilterBkId) {
    filteredEntries = filteredEntries.filter(e=>e.groups.some(g=>g.bkId===actSummaryFilterBkId));
  }
  if (!actSummaryShowUndated) {
    filteredEntries = filteredEntries.filter(e=>!!e.date);
  }
  const hiddenUndatedCount = actSummaryShowUndated ? 0 :
    entries.filter(e=>!e.date&&(!actSummaryFilterBkId||e.groups.some(g=>g.bkId===actSummaryFilterBkId))).length;

  // Build retreat filter options from bookings that have activities scheduled
  const bksWithActs = AppData.bookings.filter(b=>b.status!=='cancelled'&&(b.retreatActivities||[]).length>0);
  const filterBkOpts = bksWithActs.map(b=>{
    const nm = b.retreatName||b.leaderName||('Booking …'+b.id.slice(-4));
    return `<option value="${b.id}" ${actSummaryFilterBkId===b.id?'selected':''}>${nm}${b.startDate?' · '+fmtD(b.startDate):''}</option>`;
  }).join('');

  let html = `<div style="max-width:900px">
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:16px;padding:12px 16px;background:#f9f7f4;border:1px solid var(--border);border-radius:10px">
      <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:180px">
        <span style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap">Filter by retreat</span>
        <select onchange="actSummarySetFilter('bkId',this.value)" style="padding:6px 10px;border:1.5px solid var(--border);border-radius:7px;font-family:'Jost',sans-serif;font-size:13px;color:var(--dark);background:#fff;outline:none;flex:1;max-width:300px">
          <option value="" ${!actSummaryFilterBkId?'selected':''}>All Retreats</option>
          ${filterBkOpts}
        </select>
      </div>
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;font-weight:600;color:${actSummaryShowUndated?'#92400e':'#6b7280'};background:${actSummaryShowUndated?'#fef3c7':'#fff'};border:1.5px solid ${actSummaryShowUndated?'#f59e0b':'var(--border)'};border-radius:8px;padding:6px 12px;white-space:nowrap;transition:all .15s">
        <input type="checkbox" onchange="actSummarySetFilter('undated',this.checked)" ${actSummaryShowUndated?'checked':''} style="accent-color:#f59e0b;width:14px;height:14px;cursor:pointer">
        Show activities without dates
      </label>
    </div>
    ${hiddenUndatedCount>0?`<div style="padding:10px 14px;margin-bottom:14px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;font-size:12.5px;color:#92400e;display:flex;align-items:center;justify-content:space-between;gap:12px">
      <span>⚠ <b>${hiddenUndatedCount}</b> activit${hiddenUndatedCount>1?'ies':'y'} without dates set ${hiddenUndatedCount>1?'are':'is'} hidden.</span>
      <button onclick="actSummarySetFilter('undated',true)" style="background:#fff;border:1.5px solid #f59e0b;color:#92400e;border-radius:6px;padding:4px 12px;font-size:12px;font-weight:600;cursor:pointer;font-family:'Jost',sans-serif">Show them</button>
    </div>`:''}`;

  let entryIdx = 0;
  filteredEntries.forEach(e=>{
    const isPrepaid = e.prepaid;
    const border = isPrepaid?'#059669':'#3b82f6';
    const bg = isPrepaid?'#f0fdf4':'#eff6ff';
    const badge = isPrepaid
      ? '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;background:#dcfce7;color:#15803d">✦ Pre-Paid</span>'
      : '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;background:#dbeafe;color:#1d4ed8">Optional</span>';

    // Combined totals
    const totalSigned = e.groups.reduce((n,g)=>n+g.signedUp.length,0);
    const totalPax = e.groups.reduce((n,g)=>n+g.pax,0);
    const meetsMin = totalSigned >= MIN_GROUP;
    const countColor = totalSigned===0?'#9ca3af':meetsMin?'#059669':'#f59e0b';
    const pct = totalPax>0?Math.min(100,Math.round(totalSigned/totalPax*100)):0;
    const multiGroup = e.groups.length > 1;

    // All signed-up guests combined alphabetically
    const allGuests = e.groups.flatMap(g=>g.signedUp.map(s=>({...s, bkName:g.bkName}))).sort((a,b)=>a.last.localeCompare(b.last)||a.first.localeCompare(b.first));

    const cardKey = e.ao.id+'_'+e.date+'_'+entryIdx;
    entryIdx++;
    const bkIdsJson = JSON.stringify(e.groups.map(g=>g.bkId));
    html += `<div style="background:#fff;border:1px solid var(--border);border-radius:12px;margin-bottom:14px;overflow:hidden">
      <div style="background:${bg};border-bottom:1px solid ${border}30;padding:14px 20px;display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        <div style="flex:1;min-width:200px">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span style="font-size:15px;font-weight:700;color:var(--dark)">${e.ao.name}</span>
            ${badge}
            ${multiGroup?'<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;background:#fef3c7;color:#92400e">'+e.groups.length+' groups</span>':''}
          </div>
          <div style="font-size:12px;color:#6b7280;margin-top:3px">${e.date?fmtD(e.date):'<span style="color:#f59e0b;font-weight:600;cursor:pointer" onclick="actSummaryToggleEdit(\''+cardKey+'\')">⚠ No date set — click to assign</span>'}${e.time?' · '+fmtT(e.time):''}${e.ao.dur?' · '+fmtDur(e.ao.dur):''}${multiGroup?' · '+e.groups.map(g=>g.bkName).join(', '):' · '+e.groups[0]?.bkName}</div>
        </div>
        <div style="text-align:center;flex-shrink:0">
          <div style="font-size:32px;font-weight:700;color:${countColor};line-height:1">${totalSigned}</div>
          <div style="font-size:10.5px;color:#6b7280">signed up</div>
          <div style="width:80px;height:5px;background:#e5e7eb;border-radius:3px;margin:4px auto 0;overflow:hidden"><div style="height:100%;width:${pct}%;background:${countColor};border-radius:3px"></div></div>
          <div style="font-size:10px;margin-top:4px;font-weight:700;padding:1px 7px;border-radius:10px;display:inline-block;background:${meetsMin?'#dcfce7':'#fef3c7'};color:${meetsMin?'#15803d':'#92400e'}">${meetsMin?'✓ Group rate honored':'Need '+(MIN_GROUP-totalSigned)+' more to honor group rates'}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
          ${e.groups.map(g=>`<button onclick="actSheetCopyLink('${g.bkId}')" style="padding:4px 10px;font-size:10.5px;font-weight:600;background:#fff;color:var(--teal,#2d6a6a);border:1.5px solid #b2d8d8;border-radius:6px;cursor:pointer;font-family:'Jost',sans-serif;white-space:nowrap">🔗 ${g.bkName}</button>`).join('')}
          <button onclick="actSummaryToggleEdit('${cardKey}')" style="padding:4px 10px;font-size:10.5px;font-weight:600;background:#fff;color:#374151;border:1.5px solid var(--border);border-radius:6px;cursor:pointer;font-family:'Jost',sans-serif;white-space:nowrap">✏ Edit Date</button>
        </div>
      </div>
      ${(()=>{
        if(e.ao.id!=='ao5'||!e.date)return'';
        const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const fmtAlt=ds=>{const d=new Date(ds+'T12:00:00');return MON[d.getMonth()]+' '+d.getDate();};
        const conflictBkNames=[];const altDates=new Set();
        e.groups.forEach(g=>{
          const bk=AppData.bookings.find(b=>b.id===g.bkId);if(!bk)return;
          const hasGitano=(bk.retreatActivities||[]).some(a=>a.aoId==='ao13'&&a.date===e.date);
          if(!hasGitano)return;
          conflictBkNames.push(g.bkName);
          const nights=Math.round((new Date(bk.endDate)-new Date(bk.startDate))/86400000);
          for(let i=1;i<nights;i++){const ds=new Date(new Date(bk.startDate).getTime()+i*86400000).toISOString().slice(0,10);if(ds!==e.date)altDates.add(ds);}
        });
        if(!conflictBkNames.length)return'';
        const alts=[...altDates].sort().slice(0,3).map(fmtAlt).join(', ');
        return`<div style="padding:10px 20px;background:#fff7ed;border-bottom:1.5px solid #f97316;display:flex;align-items:flex-start;gap:10px">
          <span style="font-size:15px;flex-shrink:0">⚠️</span>
          <div style="font-size:12.5px;color:#7c2d12;line-height:1.55">
            <b>Temazcal &amp; Offsite Dinner conflict</b> — ${conflictBkNames.join(', ')} has the Gitano dinner on the same night.
            We do not schedule both on the same day.${alts?` Suggest moving the offsite dinner to: <b>${alts}</b>.`:''}
          </div>
        </div>`;
      })()}
      <div id="actEdit_${cardKey}" style="display:${e.date?'none':''};padding:12px 20px;background:#fafaf7;border-bottom:1px solid var(--border)">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:8px">Set Date &amp; Time${e.groups.length===1?' for '+e.groups[0].bkName:' for All Groups'}</div>
        ${(()=>{
          const suggs = aoDateSuggestions[e.ao.id]||[];
          if (!suggs.length) return '';
          return `<div style="margin-bottom:10px">
            <div style="font-size:10.5px;color:#6b7280;margin-bottom:5px">Other groups have this tour on:</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              ${suggs.map(s=>`<button onclick="document.getElementById('actEditDate_${cardKey}').value='${s.date}';document.getElementById('actEditTime_${cardKey}').value='${s.time}'" style="padding:4px 11px;font-size:12px;font-weight:600;background:#fff;color:var(--teal,#2d6a6a);border:1.5px solid #b2d8d8;border-radius:20px;cursor:pointer;font-family:'Jost',sans-serif">${s.label}</button>`).join('')}
            </div>
          </div>`;
        })()}
        <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap">
          <div><label style="font-size:11px;color:var(--muted);font-weight:600;display:block;margin-bottom:3px">Date</label><input type="date" id="actEditDate_${cardKey}" value="${e.date||''}" class="finp" style="width:160px"></div>
          <div><label style="font-size:11px;color:var(--muted);font-weight:600;display:block;margin-bottom:3px">Time</label><input type="time" id="actEditTime_${cardKey}" value="${e.time||''}" class="finp" style="width:130px"></div>
          <button onclick="actSummarySetDate('${e.ao.id}',${bkIdsJson},'actEditDate_${cardKey}','actEditTime_${cardKey}')" style="padding:8px 16px;background:var(--teal,#2d6a6a);color:#fff;border:none;border-radius:8px;font-family:'Jost',sans-serif;font-size:13px;font-weight:600;cursor:pointer">Save</button>
          <button onclick="actSummaryToggleEdit('${cardKey}')" style="padding:8px 12px;background:#fff;color:#374151;border:1.5px solid var(--border);border-radius:8px;font-family:'Jost',sans-serif;font-size:13px;cursor:pointer">Cancel</button>
        </div>
      </div>
      ${multiGroup ? `<div style="padding:8px 20px;background:#fffbeb;border-bottom:1px solid #fde68a;display:flex;gap:20px;flex-wrap:wrap">
        ${e.groups.map(g=>`<span style="font-size:12px;color:#92400e"><b>${g.bkName}:</b> ${g.signedUp.length} / ${g.pax} signed up</span>`).join('')}
      </div>` : ''}
      ${allGuests.length > 0 ? `<div style="padding:12px 20px">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#6b7280;margin-bottom:8px">Signed Up — Alphabetical</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:3px 16px">
          ${allGuests.map((g,i)=>`<div style="font-size:12.5px;color:var(--dark);padding:3px 0;border-bottom:1px dotted #f0ebe0;display:flex;justify-content:space-between;align-items:center"><span>${i+1}. ${g.last}, ${g.first}${g.room?`<span style="font-size:10.5px;color:#6b7280;margin-left:6px;background:#f3f4f6;padding:1px 6px;border-radius:4px">Rm ${g.room}</span>`:''}</span>${multiGroup?`<span style="font-size:10px;color:#9ca3af">${g.bkName}</span>`:''}</div>`).join('')}
        </div>
      </div>` : `<div style="padding:12px 20px;font-size:12px;color:#c8bfb5;font-style:italic">No sign-ups yet.</div>`}
      ${(()=>{
        const opsKey = e.ao.id+'|'+e.date;
        const ops = actOpsData[opsKey]||{};
        const VAN_CAP=11;
        const vansNeeded = totalSigned>0?Math.ceil(totalSigned/VAN_CAP):0;
        const costElId = 'actCost_'+opsKey.replace(/[^a-z0-9]/gi,'_');
        const aoAC = ACT_COSTS[e.ao.id]||{};
        const defEntrance = aoAC.entrance||aoAC.perPax||0;
        const entranceVal = ops.entranceMXN!=null ? ops.entranceMXN : (defEntrance||'');
        const entranceLbl = (e.ao.id==='ao9'?'Clay Fee':'Entrance/Site Fee')+' (MXN/person)';
        const inp=(id,lbl,val,placeholder)=>`<div><label style="font-size:10.5px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:3px">${lbl}</label><input type="number" id="${id}" value="${val||''}" placeholder="${placeholder}" min="0" oninput="actOpsSetNum('${opsKey}','entranceMXN',+this.value)" style="width:140px;padding:7px 10px;border:1.5px solid var(--border);border-radius:7px;font-family:'Jost',sans-serif;font-size:13px;color:var(--dark);background:var(--sand);outline:none"></div>`;
        const sel=(field,lbl,options)=>`<div><label style="font-size:10.5px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:3px">${lbl}</label><select onchange="actOpsSet('${opsKey}','${field}',this.value)" style="padding:7px 10px;border:1.5px solid var(--border);border-radius:7px;font-family:'Jost',sans-serif;font-size:13px;color:var(--dark);background:var(--sand);outline:none;min-width:150px">${options}</select></div>`;
        const chk=(field,lbl,checked,color)=>`<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;font-weight:600;color:${checked?color:'#6b7280'};background:${checked?color+'18':'#f5f5f0'};border:1.5px solid ${checked?color:'#e0dbd2'};border-radius:8px;padding:6px 12px;transition:all .15s"><input type="checkbox" onchange="actOpsSet('${opsKey}','${field}',this.checked)" ${checked?'checked':''} style="accent-color:${color};width:15px;height:15px;cursor:pointer">${lbl}</label>`;
        const guide1Opts=['',...TOUR_GUIDE_NAMES].map(v=>`<option value="${v.toLowerCase()}" ${ops.guide1===v.toLowerCase()?'selected':''}>${v||'— Guide 1 —'}</option>`).join('');
        const guide2Opts=['',...TOUR_GUIDE_NAMES].map(v=>`<option value="${v.toLowerCase()}" ${ops.guide2===v.toLowerCase()?'selected':''}>${v||'— Guide 2 (optional) —'}</option>`).join('');
        const driverOpts=['',...TOUR_DRIVER_NAMES].map(v=>`<option value="${v.toLowerCase()}" ${ops.driver===v.toLowerCase()?'selected':''}>${v||'— Assign Driver —'}</option>`).join('');
        const selectedGuides=[ops.guide1,ops.guide2].filter(Boolean).map(n=>n.charAt(0).toUpperCase()+n.slice(1));
        const guideConfirmLabel='✓ '+(selectedGuides.length?selectedGuides.join(' & ')+' Confirmed':'Guide Confirmed');
        const selectedDriver=ops.driver?ops.driver.charAt(0).toUpperCase()+ops.driver.slice(1):'';
        const driverConfirmLabel='✓ '+(selectedDriver?selectedDriver+' Confirmed':'Driver Confirmed');
        const signupColor = totalSigned===0?'#9ca3af':totalSigned>=8?'#059669':'#f59e0b';
        return `<div style="padding:14px 20px;background:#f9f7f4;border-top:1px solid #ede9e3">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
            <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:#92400e">⚙ Operations</div>
            <div style="display:flex;align-items:center;gap:10px">
              ${e.groups.map(g=>`<span style="font-size:12px;font-weight:700;color:${signupColor};background:${signupColor}18;border:1.5px solid ${signupColor}44;border-radius:20px;padding:2px 10px">${g.bkName}: ${g.signedUp.length} / ${g.pax} signed up</span>`).join('')}
              ${totalSigned>=8?'<span style="font-size:11px;color:#059669;font-weight:600">✓ Group rate honored</span>':totalSigned>0?`<span style="font-size:11px;color:#f59e0b;font-weight:600">Need ${8-totalSigned} more to honor group rates</span>`:''}
            </div>
          </div>
          <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px">
            ${sel('guide1','Guide 1',guide1Opts)}
            ${sel('guide2','Guide 2',guide2Opts)}
            ${sel('driver','Driver',driverOpts)}
            <div>
              <label style="font-size:10.5px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:5px">Van Assignment <span style="font-size:10px;color:#9ca3af;font-weight:400;text-transform:none">(${VAN_CAP}/van max${vansNeeded?' · need '+vansNeeded:''})</span></label>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                ${['van1','van2','van3'].map((vk,i)=>{const v=ops[vk]||'';const color=v?'#1d4ed8':'#6b7280';return`<div><div style="font-size:10px;color:#9ca3af;margin-bottom:3px">Van ${i+1}</div><select onchange="actOpsSet('${opsKey}','${vk}',this.value)" style="padding:5px 9px;border:1.5px solid ${v?'#3b82f6':'#e0dbd2'};border-radius:7px;font-family:'Jost',sans-serif;font-size:12px;color:${color};background:${v?'#dbeafe':'#f5f5f0'};outline:none"><option value="">— Not assigned —</option><option value="inhouse" ${v==='inhouse'?'selected':''}>🏠 In-house (~$10 gas)</option><option value="miguel" ${(v==='miguel'||v===true||v==='true')?'selected':''}>🚐 Miguel (2,000 MXN)</option></select></div>`;}).join('')}
              </div>
            </div>
            ${(e.ao.id!=='ao5'&&e.ao.id!=='ao9')?inp('actEntr_'+opsKey.replace(/[^a-z0-9]/gi,'_'),entranceLbl,entranceVal,defEntrance||'e.g. 500'):''}
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:6px">
            ${chk('guideConfirmed',guideConfirmLabel,!!ops.guideConfirmed,'#059669')}
            ${chk('driverConfirmed',driverConfirmLabel,!!ops.driverConfirmed,'#2563eb')}
            ${chk('privateTour','🔒 Private Tour',!!ops.privateTour,'#7c3aed')}
          </div>
          <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:10px">
            ${ops.guideConfirmedAt?`<span style="font-size:10.5px;color:#059669">✓ Guide confirmed ${new Date(ops.guideConfirmedAt).toLocaleDateString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span>`:''}
            ${ops.driverConfirmedAt?`<span style="font-size:10.5px;color:#2563eb">✓ Driver confirmed ${new Date(ops.driverConfirmedAt).toLocaleDateString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span>`:''}
          </div>
          ${ops.privateTour?`<div style="font-size:12px;color:#6d28d9;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:7px;padding:8px 12px;margin-bottom:10px">This group goes separately — assign a dedicated guide &amp; van below. Other groups can still book the same activity on a different van.</div>`:''}
          <div id="${costElId}" data-signed="${totalSigned}" data-aoid="${e.ao.id}">${actOpsCostHtml(ops,totalSigned,e.ao.id,opsKey)}</div>
        </div>`;
      })()}
    </div>`;
  });
  html += '</div>';
  el.innerHTML = html;
}

async function actOpsLoad() {
  try {
    const {data} = await db.from('app_store').select('value').eq('key','act_ops').single();
    if (data?.value) actOpsData = data.value;
  } catch(e) {}
}
async function actOpsSave() {
  try { await db.from('app_store').upsert({key:'act_ops',value:actOpsData,updated_at:new Date().toISOString()}); } catch(e){}
}
function actOpsSet(opsKey, field, val) {
  if (!actOpsData[opsKey]) actOpsData[opsKey]={};
  actOpsData[opsKey][field]=val;
  // Timestamp confirmations so there's a record of when/who confirmed
  if (field==='guideConfirmed' && val) actOpsData[opsKey].guideConfirmedAt=new Date().toISOString();
  if (field==='driverConfirmed' && val) actOpsData[opsKey].driverConfirmedAt=new Date().toISOString();
  actOpsSave();
  actSheetRenderSummary();
}
function actOpsSetNum(opsKey, field, val) {
  if (!actOpsData[opsKey]) actOpsData[opsKey]={};
  actOpsData[opsKey][field]=val;
  actOpsSave();
  actOpsRefreshCost(opsKey);
}
function actOpsRefreshCost(opsKey) {
  const el = document.getElementById('actCost_'+opsKey.replace(/[^a-z0-9]/gi,'_'));
  if (!el) return;
  const ops = actOpsData[opsKey]||{};
  const totalSigned = parseInt(el.dataset.signed||'0');
  const aoId = el.dataset.aoid||'';
  el.innerHTML = actOpsCostHtml(ops, totalSigned, aoId, opsKey);
}
const ACT_COSTS = {
  ao1: {entrance:515, entranceLabel:'Tulum Ruins Entrance'},
  ao3: {entrance:1000, entranceLabel:'Atik Art Tour Entrance'},
  ao6: {entrance:350, entranceLabel:'Grande Cenote Entrance'},
  ao9: {guideMXN:800, clayUSDpp:6, clientUSDpp:65},
  ao5: {golly:1500, ceremonyLeadBase:2000, ceremonyLeadBasePax:10, ceremonyLeadExtraPP:100, herbs:20},
  ao4: {splitNote:true},
  ao10: {perPersonUSD:45, ryan:0.40, ice:0.10, melissa:0.50}
};

function actOpsCostHtml(ops, totalSigned, aoId, opsKey) {
  const VAN_COST_MIGUEL=2000, VAN_COST_INHOUSE=170, VAN_CAP=11; // 170 MXN ≈ $10 USD gas
  const ac = ACT_COSTS[aoId]||{};
  // Count vans by type across van1/van2/van3
  const vanTypes = ['van1','van2','van3'].map(k=>ops[k]||'').filter(v=>v);
  const miguelVans = vanTypes.filter(v=>v==='miguel'||v===true||v==='true').length;
  const inhouseVans = vanTypes.filter(v=>v==='inhouse').length;
  const vansUsedTotal = miguelVans + inhouseVans;
  const VAN_COST = VAN_COST_MIGUEL; // keep for backwards compat below

  const secHdr = lbl=>`<div style="font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.7px;color:#9ca3af;margin:10px 0 4px">${lbl}</div>`;
  const row=(label,amount,note='')=>`<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12.5px;border-bottom:1px solid #f0ebe0">
    <span style="color:#374151">${label}${note?'<span style="font-size:10.5px;color:#9ca3af;margin-left:5px">'+note+'</span>':''}</span>
    <span style="font-weight:600;color:var(--dark)">${amount>0?amount.toLocaleString()+' MXN':'—'}</span>
  </div>`;
  const totalRow=(amount)=>`<div style="display:flex;justify-content:space-between;padding:7px 0 2px;border-top:2px solid #e5e7eb;margin-top:6px">
    <span style="font-size:13px;font-weight:700;color:var(--dark)">Cost for Client</span>
    <span style="font-size:15px;font-weight:700;color:#7c3aed">${amount.toLocaleString()} MXN</span>
  </div>`;

  // Temazcal: on-site ceremony — no transport
  if (aoId==='ao5') {
    const golly = ac.golly;
    // $2000 covers up to 10 pax; +$100/extra person; e.g. 20 pax = $3000
    const basePax = ac.ceremonyLeadBasePax||10;
    const extraPax = Math.max(0, totalSigned - basePax);
    const lead = ac.ceremonyLeadBase + extraPax*ac.ceremonyLeadExtraPP;
    const herbsCost = totalSigned>0 ? ac.herbs*totalSigned : 0;
    const total = golly+lead+herbsCost;
    const fireKeeperOpts = ['',...TEMAZCAL_FIRE_KEEPER_NAMES].map(v=>`<option value="${v}" ${ops.fireKeeper===v?'selected':''}>${v||'— Fire Keeper —'}</option>`).join('');
    const fireKeeperSel = opsKey?`<select onchange="actOpsSet('${opsKey}','fireKeeper',this.value)" style="padding:4px 8px;border:1.5px solid var(--border);border-radius:6px;font-family:'Jost',sans-serif;font-size:11.5px;color:var(--dark);background:#fff;margin-left:6px">${fireKeeperOpts}</select>`:'';
    return `<div>
      ${secHdr('Entry / Ceremony Costs')}
      <div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;font-size:12.5px;border-bottom:1px solid #f0ebe0">
        <span style="color:#374151;display:flex;align-items:center">Fire Keeper${fireKeeperSel}</span>
        <span style="font-weight:600;color:var(--dark)">${golly>0?golly.toLocaleString()+' MXN':'—'}</span>
      </div>
      ${row('Ceremony Lead (María Luisa / Gaby)',lead,totalSigned>basePax?basePax+' pax + '+extraPax+' extra × $'+ac.ceremonyLeadExtraPP:'up to '+basePax+' pax, fixed')}
      ${totalSigned>0?row('Herbs',herbsCost,totalSigned+' pax × $'+ac.herbs):''}
      ${total?totalRow(total):''}
    </div>`;
  }

  // Mayan Clay: guide 800 MXN (~$47 USD) + clay $6 USD/pax; client pays $65 USD/pax
  if (aoId==='ao9') {
    const MXN_RATE = 17; // approx MXN per USD
    const guideMXN = ac.guideMXN||800;
    const guideUSD = Math.round(guideMXN/MXN_RATE);
    const clayUSDpp = ac.clayUSDpp||6;
    const clientUSDpp = ac.clientUSDpp||65;
    const vanMXN = miguelVans*VAN_COST_MIGUEL + inhouseVans*VAN_COST_INHOUSE;
    const vanUSD = Math.round(vanMXN/MXN_RATE);
    const vanNote = [miguelVans?miguelVans+' Miguel (2,000 MXN ea)':'',inhouseVans?inhouseVans+' in-house (~$10 gas)':''].filter(Boolean).join(' + ');

    const revenueUSD = totalSigned>0 ? clientUSDpp*totalSigned : 0;
    const clayCostUSD = totalSigned>0 ? clayUSDpp*totalSigned : 0;
    const totalCostUSD = guideUSD + clayCostUSD + vanUSD;
    const profitUSD = revenueUSD>0 ? revenueUSD - totalCostUSD : 0;
    const profitPct = revenueUSD>0 ? Math.round(profitUSD/revenueUSD*100) : 0;
    const profitColor = profitUSD>0?'#059669':'#dc2626';
    const costPP = totalSigned>0 ? Math.round(totalCostUSD/totalSigned) : 0;
    const profitPP = totalSigned>0 ? Math.round(profitUSD/totalSigned) : clientUSDpp - (guideUSD+clayUSDpp);

    const rowUSD=(label,amt,note='')=>`<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12.5px;border-bottom:1px solid #f0ebe0">
      <span style="color:#374151">${label}${note?'<span style="font-size:10.5px;color:#9ca3af;margin-left:5px">'+note+'</span>':''}</span>
      <span style="font-weight:600;color:var(--dark)">$${amt} USD</span>
    </div>`;

    return `<div>
      ${secHdr('Cost for Transport')}
      ${rowUSD('Guide — fixed',guideUSD,'800 MXN ÷ 17')}
      ${vansUsedTotal?rowUSD('Vans',vanUSD,vanNote):''}
      ${secHdr('Cost for Materials')}
      ${rowUSD('Clay',clayCostUSD,totalSigned>0?totalSigned+' pax × $'+clayUSDpp:'~$'+clayUSDpp+'/person')}
      <div style="display:flex;justify-content:space-between;padding:7px 0 2px;border-top:2px solid #e5e7eb;margin-top:6px">
        <span style="font-size:13px;font-weight:700;color:var(--dark)">Client Pays</span>
        <span style="font-size:15px;font-weight:700;color:#7c3aed">$${revenueUSD>0?revenueUSD:clientUSDpp+'/person'} USD${totalSigned>0?' ('+totalSigned+' × $'+clientUSDpp+')':''}</span>
      </div>
      ${totalSigned>0?`<div style="margin-top:10px;padding:10px 14px;background:${profitUSD>0?'#f0fdf4':'#fef2f2'};border:1.5px solid ${profitColor}30;border-radius:8px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:${profitColor}">Net Profit</span>
          <span style="font-size:16px;font-weight:700;color:${profitColor}">$${profitUSD} USD <span style="font-size:11px">(${profitPct}%)</span></span>
        </div>
        <div style="font-size:10.5px;color:#6b7280;margin-top:3px">$${revenueUSD} revenue − $${totalCostUSD} costs · cost/person: $${costPP} · profit/person: $${profitPP}</div>
      </div>`:'<div style="font-size:11.5px;color:#9ca3af;font-style:italic;margin-top:6px">Profit grows as more guests sign up — $'+clientUSDpp+'/person revenue vs ~$'+(guideUSD+clayUSDpp)+'/person base cost</div>'}
    </div>`;
  }

  // Sound Healing & Cacao Ceremony — Ignacia (sound healing helper) is paid
  // a fixed MXN fee (tiered by guest count) out of the team's 50% share;
  // Darlene and Kun split whatever's left of that 50% evenly.
  if (aoId==='ao4') {
    const IGNACIA_TIERS=[{max:7,fee:800},{max:15,fee:1100},{max:20,fee:1300},{max:25,fee:1600},{max:30,fee:1800},{max:35,fee:2000},{max:40,fee:2250}];
    const ignaciaFeeFor=n=>{const t=IGNACIA_TIERS.find(x=>n<=x.max);return t?t.fee:null;};
    const totalCollected=ops.totalCollectedMXN||0;
    const currency=ops.ignaciaCurrency||'MXN';
    const exchangeRate=ops.exchangeRate||0;
    const ignaciaFee=totalSigned>0?ignaciaFeeFor(totalSigned):null;
    const housePayment=totalCollected*0.5;
    const teamPool=totalCollected*0.5;
    const overTier=totalSigned>40;
    const canCalc=totalCollected>0&&ignaciaFee!=null&&teamPool>=ignaciaFee;
    const remaining=canCalc?teamPool-ignaciaFee:0;
    const darlenePayment=canCalc?remaining/2:0;
    const kunPayment=canCalc?remaining/2:0;
    const ignaciaUSD=currency==='USD'&&exchangeRate>0?ignaciaFee/exchangeRate:null;
    const mxn=n=>n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})+' MXN';
    const inp=(field,val,ph)=>`<input type="number" step="0.01" value="${val||''}" placeholder="${ph||''}" onchange="actOpsSetNum('${opsKey}','${field}',+this.value)" style="width:120px;padding:5px 8px;border:1.5px solid var(--border);border-radius:6px;font-family:'Jost',sans-serif;font-size:12.5px;color:var(--dark);background:#fff;outline:none">`;
    const textRow=(label,val)=>`<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12.5px;border-bottom:1px solid #f0ebe0">
      <span style="color:#374151">${label}</span><span style="font-weight:600;color:var(--dark)">${val}</span>
    </div>`;
    return `<div>
      <div style="font-size:11.5px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:7px 10px;margin-bottom:10px">ℹ️ <b>Sound Healing &amp; Cacao Ceremony</b> — house takes 50%; Ignacia's fee comes out of the remaining 50% (by guest count); the rest splits evenly between Darlene and Kun.</div>
      <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;margin-bottom:10px">
        <div><label style="font-size:10.5px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:3px">Total Collected (MXN)</label>${inp('totalCollectedMXN',ops.totalCollectedMXN,'e.g. 8000')}</div>
        <div><label style="font-size:10.5px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:3px">Pay Ignacia In</label>
          <select onchange="actOpsSet('${opsKey}','ignaciaCurrency',this.value)" style="padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-family:'Jost',sans-serif;font-size:12.5px;color:var(--dark);background:#fff">
            <option value="MXN"${currency==='MXN'?' selected':''}>MXN</option>
            <option value="USD"${currency==='USD'?' selected':''}>USD</option>
          </select>
        </div>
        ${currency==='USD'?`<div><label style="font-size:10.5px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:3px">Exchange Rate (MXN per $1)</label>${inp('exchangeRate',ops.exchangeRate,'e.g. 18')}</div>`:''}
      </div>
      ${overTier?'<div style="font-size:12px;color:#dc2626;font-weight:600;margin-bottom:8px">⚠ '+totalSigned+' guests is above the 40-guest tier table — enter Ignacia\'s fee manually with Amansala before confirming.</div>':''}
      ${totalCollected>0&&ignaciaFee!=null&&!canCalc?`<div style="font-size:12px;color:#dc2626;font-weight:600;margin-bottom:8px">⚠ Cannot calculate — the 50% team pool (${mxn(teamPool)}) is less than Ignacia's fee (${mxn(ignaciaFee)}). Total collected is too low for this group size.</div>`:''}
      ${totalCollected>0?`
        ${row('Total Collected',totalCollected)}
        ${row('House Payment (50%)',housePayment)}
        ${ignaciaFee!=null?row('Ignacia\'s Payment',ignaciaFee,totalSigned+' guests'):''}
        ${ignaciaFee!=null?textRow('Currency Used for Ignacia',currency):''}
        ${ignaciaFee!=null&&currency==='USD'?textRow('Exchange Rate',exchangeRate>0?exchangeRate+' MXN per $1':'not set'):''}
        ${ignaciaFee!=null&&currency==='USD'&&ignaciaUSD!=null?textRow('Ignacia\'s Payment (USD)','$'+ignaciaUSD.toFixed(2)+' USD'):''}
        ${canCalc?row('Darlene\'s Payment',darlenePayment):''}
        ${canCalc?row('Kun\'s Payment',kunPayment):''}
        ${canCalc?totalRow(housePayment+ignaciaFee+darlenePayment+kunPayment):''}
      `:'<div style="font-size:11.5px;color:#9ca3af;font-style:italic">Enter total collected to see the payment breakdown.</div>'}
    </div>`;
  }

  // Ice Bath: $45 USD/person split Ryan 40% / Ice 10% / Melissa 50%
  if (aoId==='ao10') {
    const pp = ac.perPersonUSD;
    const ryanAmt = pp*ac.ryan;
    const iceAmt = pp*ac.ice;
    const melissaAmt = pp*ac.melissa;
    const totalUSD = totalSigned>0 ? pp*totalSigned : 0;
    const fmt = n => '$'+n.toFixed(2);
    const rowUSD=(label,pct,ppAmt)=>`<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12.5px;border-bottom:1px solid #f0ebe0">
      <span style="color:#374151">${label}<span style="font-size:10.5px;color:#9ca3af;margin-left:5px">${Math.round(pct*100)}% · ${fmt(ppAmt)}/person</span></span>
      <span style="font-weight:600;color:var(--dark)">${totalSigned>0?fmt(ppAmt*totalSigned)+' USD':'—'}</span>
    </div>`;
    return `<div>
      ${secHdr('Cost for Entry — Split Breakdown')}
      ${rowUSD('Ryan',ac.ryan,ryanAmt)}
      ${rowUSD('Ice',ac.ice,iceAmt)}
      ${rowUSD('Melissa',ac.melissa,melissaAmt)}
      ${totalSigned>0?`<div style="display:flex;justify-content:space-between;padding:7px 0 2px;border-top:2px solid #e5e7eb;margin-top:6px">
        <span style="font-size:13px;font-weight:700;color:var(--dark)">Cost for Client</span>
        <span style="font-size:15px;font-weight:700;color:#7c3aed">${fmt(totalUSD)} USD <span style="font-size:11px;font-weight:400;color:#9ca3af">(${fmt(pp)}/person × ${totalSigned})</span></span>
      </div>`:`<div style="font-size:11.5px;color:#9ca3af;margin-top:8px">$${pp} USD per person once guests sign up</div>`}
    </div>`;
  }

  // Standard tours (ao1 Tulum 515, ao3 Atik 1000, ao6 Grande 350) and others
  const GUIDE_COST=1000;
  const guideCount=(ops.guide1?1:0)+(ops.guide2?1:0)||1;
  const guideCostEstimate=guideCount*GUIDE_COST;
  const guideCostConfirmed=ops.guideConfirmed?guideCostEstimate:0;
  const vansNeeded=totalSigned>0?Math.ceil(totalSigned/VAN_CAP):0;
  const vanCostTotal=miguelVans*VAN_COST_MIGUEL+inhouseVans*VAN_COST_INHOUSE;
  const vanNote=[miguelVans?miguelVans+' Miguel (2,000 ea)':'',inhouseVans?inhouseVans+' in-house (~$10 gas)':''].filter(Boolean).join(' + ');
  const defaultEntrance=ac.entrance||0;
  const entrance=ops.entranceMXN!=null?parseFloat(ops.entranceMXN)||0:defaultEntrance;
  const entranceCost=entrance*totalSigned;
  const totalCost=guideCostConfirmed+vanCostTotal+entranceCost;
  const needSecondGuide=totalSigned>VAN_CAP&&!ops.guide2;
  const costPP = totalSigned>0&&totalCost>0 ? Math.round(totalCost/totalSigned) : 0;
  const guideRow = ops.guideConfirmed
    ? row('Guide'+(guideCount>1?'s':''),guideCostEstimate,guideCount+' × $1,000')
    : `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12.5px;border-bottom:1px solid #f0ebe0;opacity:.65">
        <span style="color:#374151">Guide${guideCount>1?'s':''}<span style="font-size:10.5px;color:#f59e0b;margin-left:5px">est. — not yet confirmed</span></span>
        <span style="font-weight:600;color:var(--dark)">${guideCostEstimate.toLocaleString()} MXN</span>
      </div>`;
  return `<div>
    ${needSecondGuide?`<div style="font-size:11.5px;color:#dc2626;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:7px 10px;margin-bottom:8px">⚠ <b>${totalSigned} sign-ups</b> — a 2nd guide is required for groups over 11.</div>`:''}
    ${secHdr('Cost for Transport')}
    ${guideRow}
    ${vansUsedTotal?row('Vans',vanCostTotal,vanNote):''}
    ${vansNeeded&&!vansUsedTotal?`<div style="font-size:11px;color:#f59e0b;padding:3px 0">⚠ ${totalSigned} pax — need ${vansNeeded} van${vansNeeded>1?'s':''}</div>`:''}
    ${secHdr('Cost for Entry')}
    ${entranceCost?row(ac.entranceLabel||'Entrance Fee',entranceCost,totalSigned+' pax × $'+entrance):(entrance?row(ac.entranceLabel||'Entrance Fee',0,totalSigned+' pax × $'+entrance+' = 0 (no sign-ups yet)'):'<div style="font-size:11.5px;color:#9ca3af">'+(defaultEntrance?defaultEntrance+' MXN/person':'Set entrance fee above')+'</div>')}
    ${totalCost?`${totalRow(totalCost)}${costPP?'<div style="font-size:11px;color:#6b7280;text-align:right;margin-top:3px">Cost per person: <b>'+costPP.toLocaleString()+' MXN</b></div>':''}`:''}
  </div>`;
}

function actSummaryToggleEdit(cardKey) {
  const el = document.getElementById('actEdit_'+cardKey);
  if (el) el.style.display = el.style.display==='none' ? '' : 'none';
}

function actSummarySetDate(aoId, bkIds, dateInputId, timeInputId) {
  const newDate = document.getElementById(dateInputId)?.value || '';
  const newTime = document.getElementById(timeInputId)?.value || '';
  if (!newDate) { showToast('Please select a date.'); return; }
  let updated = 0;
  let skippedArrival = 0;
  bkIds.forEach(bkId => {
    const bk = AppData.bookings.find(b => b.id === bkId);
    if (!bk) return;
    if (newDate === bk.startDate) { skippedArrival++; return; } // never schedule activities on the arrival day
    // Update existing entry
    const act = (bk.retreatActivities||[]).find(a => a.aoId === aoId);
    if (act) {
      act.date = newDate;
      if (newTime) act.time = newTime;
      updated++;
    } else {
      // Add new entry (for packages without a scheduled date yet)
      if (!bk.retreatActivities) bk.retreatActivities = [];
      const prepaid = (bk.packages||[]).includes(aoId);
      bk.retreatActivities.push({aoId, date:newDate, time:newTime, prepaid});
      updated++;
    }
    bk.retreatActivitiesUpdatedAt=new Date().toISOString();
  });
  saveAll();
  showToast('Date saved for ' + updated + ' group' + (updated!==1?'s':'') + '.' + (skippedArrival?' Skipped '+skippedArrival+' — can\'t schedule on the arrival day.':''));
  actSheetRenderSummary();
}

async function actAdminAddSignup(bkId) {
  const bk = AppData.bookings.find(b=>b.id===bkId); if(!bk) return;
  const aoMap={}; (ADD_ONS||[]).forEach(a=>aoMap[a.id]=a);
  const acts = (bk.retreatActivities||[]).filter(a=>!a.prepaid&&a.aoId);
  if (!acts.length) { showToast('No optional activities on this booking yet.'); return; }

  const fmtD=ds=>{if(!ds)return'TBD';const d=new Date(ds+'T12:00:00');return d.toLocaleDateString('en-US',{month:'short',day:'numeric'});};
  const actCheckboxes = acts.map(a=>{
    const ao=aoMap[a.aoId]||{name:a.aoId};
    return `<label style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:13px;cursor:pointer;border-bottom:1px solid #f0ebe0">
      <input type="checkbox" value="${a.aoId}" style="width:15px;height:15px;accent-color:var(--teal,#2d6a6a);cursor:pointer">
      <span style="font-weight:600">${ao.name}</span>${a.date?`<span style="font-size:11px;color:#9ca3af;margin-left:4px">${fmtD(a.date)}</span>`:''}
    </label>`;
  }).join('');

  const html=`<div style="padding:20px;max-width:420px;font-family:'Jost',sans-serif">
    <div style="font-size:16px;font-weight:700;color:var(--dark,#1a2332);margin-bottom:4px">Add Guest Sign-Up</div>
    <div style="font-size:12px;color:#6b7280;margin-bottom:16px">${bk.leaderName||bk.retreatName||'Group'}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
      <div><label style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:4px">First Name *</label><input id="adminSuFirst" type="text" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:7px;font-family:'Jost',sans-serif;font-size:13px;box-sizing:border-box" placeholder="Sarah"></div>
      <div><label style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:4px">Last Name *</label><input id="adminSuLast" type="text" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:7px;font-family:'Jost',sans-serif;font-size:13px;box-sizing:border-box" placeholder="Anderson"></div>
    </div>
    <div style="margin-bottom:12px"><label style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:4px">Room Number</label><input id="adminSuRoom" type="text" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:7px;font-family:'Jost',sans-serif;font-size:13px;box-sizing:border-box" placeholder="e.g. 12"></div>
    <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Activities</div>
    <div id="adminSuActs" style="margin-bottom:16px">${actCheckboxes}</div>
    <div style="display:flex;gap:8px">
      <button onclick="actAdminSaveSignup('${bkId}')" style="flex:1;padding:10px;background:var(--teal,#2d6a6a);color:#fff;border:none;border-radius:8px;font-family:'Jost',sans-serif;font-size:14px;font-weight:600;cursor:pointer">Save Sign-Up</button>
      <button onclick="document.getElementById('actAdminSignupModal').style.display='none'" style="padding:10px 16px;background:#fff;color:#374151;border:1.5px solid var(--border);border-radius:8px;font-family:'Jost',sans-serif;font-size:14px;cursor:pointer">Cancel</button>
    </div>
  </div>`;
  document.getElementById('actAdminSignupModal').innerHTML=html;
  document.getElementById('actAdminSignupModal').style.display='flex';
}

async function actAdminSaveSignup(bkId) {
  const first=(document.getElementById('adminSuFirst')?.value||'').trim();
  const last=(document.getElementById('adminSuLast')?.value||'').trim();
  const room=(document.getElementById('adminSuRoom')?.value||'').trim();
  if(!first||!last){showToast('First and last name required.');return;}
  const checked=[...document.querySelectorAll('#adminSuActs input[type=checkbox]:checked')].map(c=>c.value);
  if(!checked.length){showToast('Select at least one activity.');return;}
  try {
    const {data:sd}=await db.from('app_store').select('value').eq('key','act_signups_'+bkId).single();
    let signups=sd?.value||[];
    const isMine=s=>s.firstName?.toLowerCase()===first.toLowerCase()&&s.lastName?.toLowerCase()===last.toLowerCase();
    signups=signups.filter(s=>!isMine(s));
    signups.push({id:'su_admin_'+Date.now(),bookingId:bkId,firstName:first,lastName:last,roomNumber:room,activities:checked,submittedAt:new Date().toISOString(),addedByAdmin:true});
    await db.from('app_store').upsert({key:'act_signups_'+bkId,value:signups,updated_at:new Date().toISOString()});
    actSheetSignups[bkId]=signups;
    document.getElementById('actAdminSignupModal').style.display='none';
    actSheetRenderWeek();
    actSheetRenderSummary();
    showToast(`${first} ${last} signed up successfully.`);
  } catch(e){showToast('Error saving sign-up. Try again.');}
}

function actGuestReport() {
  const aoMap={};(ADD_ONS||[]).forEach(a=>aoMap[a.id]=a);
  const fmtD=ds=>{if(!ds)return'TBD';const d=new Date(ds+'T12:00:00');return d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});};
  const fmtT=t=>{if(!t)return'';const[h,m]=t.split(':').map(Number);return ' · '+((h%12)||12)+':'+String(m).padStart(2,'0')+(h>=12?' PM':' AM');};

  // Build per-guest map: {name, room, bkName, activities:[{aoId, name, date, time}]}
  const guestMap = {}; // key: bkId+'|'+firstName+'|'+lastName
  AppData.bookings.filter(b=>b.status!=='cancelled').forEach(bk=>{
    const sups = actSheetSignups[bk.id]||[];
    const bkName = bk.leaderName||bk.retreatName||'Group';
    const actDateMap = {};
    (bk.retreatActivities||[]).forEach(a=>{ actDateMap[a.aoId]={date:a.date||'',time:a.time||''}; });
    sups.forEach(s=>{
      const key = bk.id+'|'+(s.firstName||'')+'|'+(s.lastName||'');
      if (!guestMap[key]) guestMap[key]={first:s.firstName||'',last:s.lastName||'',room:s.roomNumber||'',bkName,activities:[]};
      (s.activities||[]).forEach(aoId=>{
        const ao=aoMap[aoId]; if(!ao) return;
        const sched=actDateMap[aoId]||{date:'',time:''};
        guestMap[key].activities.push({aoId,name:ao.name,date:sched.date,time:sched.time});
      });
      guestMap[key].activities.sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
    });
  });

  const guests = Object.values(guestMap).sort((a,b)=>a.last.localeCompare(b.last)||a.first.localeCompare(b.first));
  if (!guests.length) { showToast('No sign-ups found. Click Refresh first.'); return; }

  const rows = guests.map(g=>`
    <tr style="vertical-align:top">
      <td style="padding:8px 10px;font-size:12px;border-bottom:1px solid #e5e7eb;font-weight:600;white-space:nowrap">${g.last}, ${g.first}</td>
      <td style="padding:8px 10px;font-size:11px;border-bottom:1px solid #e5e7eb;color:#6b7280">${g.room?'Rm '+g.room:''}</td>
      <td style="padding:8px 10px;font-size:11px;border-bottom:1px solid #e5e7eb;color:#6b7280">${g.bkName}</td>
      <td style="padding:8px 10px;font-size:12px;border-bottom:1px solid #e5e7eb">
        ${g.activities.length ? g.activities.map(a=>`<div style="margin-bottom:3px">✓ <b>${a.name}</b>${a.date?' — '+fmtD(a.date)+fmtT(a.time):''}</div>`).join('') : '<span style="color:#9ca3af;font-style:italic">None</span>'}
      </td>
    </tr>`).join('');

  const win=window.open('','_blank','width=900,height=700');
  win.document.write(`<!DOCTYPE html><html><head>
  <link rel="icon" type="image/png" href="/favicon.png"><title>Guest Activity Report</title>
  <style>body{font-family:'Jost',sans-serif;padding:30px;color:#1a2332}h2{font-size:18px;margin-bottom:4px}p{font-size:12px;color:#6b7280;margin-bottom:20px}table{width:100%;border-collapse:collapse}th{text-align:left;padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.6px;background:#f9f7f4;border-bottom:2px solid #e5e7eb}@media print{button{display:none}}</style></head>
  <body>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
    <div><h2>Guest Activity Report</h2><p>Generated ${new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})} · ${guests.length} guests · ${guests.reduce((n,g)=>n+g.activities.length,0)} total sign-ups</p></div>
    <button onclick="window.print()" style="padding:8px 18px;background:#2d6a6a;color:#fff;border:none;border-radius:7px;font-family:'Jost',sans-serif;font-size:13px;font-weight:600;cursor:pointer">Print / Save PDF</button>
  </div>
  <table>
    <thead><tr><th>Guest</th><th>Room</th><th>Retreat</th><th>Activities Signed Up</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  </body></html>`);
  win.document.close();
}

function actSheetPrint() {
  if (!actSheetMonday) return;
  const weekStart = new Date(actSheetMonday+'T12:00:00');
  const days=[];
  for(let i=0;i<7;i++){const d=new Date(weekStart);d.setDate(d.getDate()+i);days.push(d.toISOString().split('T')[0]);}
  const wFirst=days[0],wLast=days[6];
  const wEnd=new Date(weekStart);wEnd.setDate(wEnd.getDate()+6);
  const fmtD=d=>d.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
  const fmtT=t=>{if(!t)return'TBD';const[h,m]=t.split(':').map(Number);return((h%12)||12)+':'+String(m).padStart(2,'0')+(h>=12?' PM':' AM');};
  const fmtDur=m=>{if(!m)return'';const h=Math.floor(m/60),r=m%60;return h+(r?'.5':'')+'hr';};
  const aoMap={};(ADD_ONS||[]).forEach(a=>aoMap[a.id]=a);

  // Collect all activities this week, organized per activity-per-day
  const sheets=[]; // [{aoId, ao, date, time, prepaid, bkName, pax, signedUp:[]}]
  AppData.bookings.filter(b=>b.status!=='cancelled').forEach(bk=>{
    const s=(bk.startDate||'').slice(0,10),e=(bk.endDate||'').slice(0,10);
    if(!s||!e||s>wLast||e<wFirst) return;
    const sups=actSheetSignups[bk.id]||[];
    (bk.retreatActivities||[]).forEach(act=>{
      const ds=(act.date||'').slice(0,10);
      if(!ds||ds<wFirst||ds>wLast) return;
      const ao=aoMap[act.aoId]||{name:act.aoId,price:0,dur:0};
      const signedUp=sups.filter(s=>(s.activities||[]).includes(act.aoId))
        .map(s=>({first:s.firstName||'',last:s.lastName||''}))
        .sort((a,b)=>a.last.localeCompare(b.last)||a.first.localeCompare(b.first));
      sheets.push({ao,date:ds,time:act.time||'',prepaid:!!act.prepaid,bkName:bk.leaderName||bk.retreatName||'Group',pax:bk.pax||0,signedUp});
    });
  });
  sheets.sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:a.time<b.time?-1:a.time>b.time?1:0);

  let body='';
  sheets.forEach(s=>{
    const d=new Date(s.date+'T12:00:00');
    const guestRows=s.signedUp.map((g,i)=>`<tr><td style="padding:4px 8px;font-size:12px;border-top:1px solid #e5e7eb;color:#374151">${i+1}.</td><td style="padding:4px 8px;font-size:12px;border-top:1px solid #e5e7eb">${g.last}, ${g.first}</td><td style="padding:4px 8px;font-size:12px;border-top:1px solid #e5e7eb;color:#6b7280">${g.room?'Rm '+g.room:''}</td></tr>`).join('');
    const emptyRows=s.signedUp.length<3?Array(3-s.signedUp.length).fill('<tr><td style="padding:4px 8px;border-top:1px solid #e5e7eb;height:26px"></td><td style="border-top:1px solid #e5e7eb"></td><td style="border-top:1px solid #e5e7eb"></td></tr>').join(''):'';
    body+=`<div style="break-inside:avoid;margin-bottom:28px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      <div style="background:${s.prepaid?'#f0fdf4':'#eff6ff'};padding:12px 16px;border-bottom:1px solid ${s.prepaid?'#bbf7d0':'#bfdbfe'}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <div style="font-size:16px;font-weight:700;color:#1a2332">${s.ao.name}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:3px">${s.bkName} · ${s.pax} guests</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:12px;font-weight:600;color:#374151">${fmtD(d)}</div>
            <div style="font-size:12px;color:#6b7280">${fmtT(s.time)}${s.ao.dur?' · '+fmtDur(s.ao.dur):''}</div>
            <div style="margin-top:4px;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;display:inline-block;background:${s.prepaid?'#dcfce7':'#dbeafe'};color:${s.prepaid?'#15803d':'#1d4ed8'}">${s.prepaid?'✦ PRE-PAID':'OPTIONAL'}</div>
          </div>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:#f9fafb">
          <th style="padding:5px 8px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#9ca3af;text-align:left;width:30px">#</th>
          <th style="padding:5px 8px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#9ca3af;text-align:left">Guest Name</th>
          <th style="padding:5px 8px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#9ca3af;text-align:left">Notes</th>
        </tr></thead>
        <tbody>${guestRows}${emptyRows}</tbody>
        <tfoot><tr style="background:#f9fafb"><td colspan="3" style="padding:5px 8px;font-size:11px;font-weight:600;color:#6b7280">${s.signedUp.length} signed up</td></tr></tfoot>
      </table>
    </div>`;
  });

  if(!body) body='<p style="color:#9ca3af;font-style:italic;text-align:center;padding:40px">No activities scheduled this week.</p>';

  const fmt2=d=>d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
  const win=window.open('','_blank');
  win.document.write(`<!DOCTYPE html><html><head>
  <link rel="icon" type="image/png" href="/favicon.png"><title>Activity Sheet · ${fmt2(weekStart)} – ${fmt2(wEnd)}</title>
    <link href="https://fonts.googleapis.com/css2?family=Jost:wght@300;400;600;700&display=swap" rel="stylesheet">
    <style>body{font-family:'Jost',sans-serif;margin:32px;color:#1a2332}@media print{body{margin:16px}.no-print{display:none}}</style>
  </head><body>
    <div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:3px solid #2d6a6a;padding-bottom:12px;margin-bottom:28px">
      <div><h2 style="margin:0;font-size:22px;color:#2d6a6a">Activity Sheet</h2>
        <div style="font-size:13px;color:#6b7280;margin-top:3px">${fmt2(weekStart)} – ${fmt2(wEnd)}, ${weekStart.getFullYear()}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:13px;font-weight:600;color:#1a2332">Amansala · Tulum</div>
        <button class="no-print" onclick="window.print()" style="margin-top:6px;padding:6px 16px;background:#2d6a6a;color:#fff;border:none;border-radius:6px;cursor:pointer;font-family:'Jost',sans-serif;font-size:12px;font-weight:600">Print</button>
      </div>
    </div>
    ${body}
  </body></html>`);
  win.document.close();
  setTimeout(()=>win.print(),400);
}

