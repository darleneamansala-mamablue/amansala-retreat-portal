// ===== dietary-report.js — printable weekly dietary/allergy summary =====
// Loaded as a classic script; shares global scope with booking-hub.html (same pattern as other modules/*.js).
// Do not add <script type="module"> here — onclick="..." handlers in the HTML rely on plain globals.
//
// Pulls ONLY from the free-text guest notes already used in the Room List
// (reg.guests[].notes) — there is no separate structured "dietary" field —
// and keyword-matches them into counted categories (English + Spanish, since
// kitchen staff read this in Spanish) for a printable per-retreat tally.
// Any note that mentions an allergy but doesn't cleanly match a known keyword
// is never silently dropped — it's listed verbatim under "Needs Review" so a
// real allergy can't get lost inside a wrong bucket.

const DIET_CATEGORIES=[
  {key:'vegan',        label:'Veganos',            re:/\bvegan/i},
  {key:'vegetarian',   label:'Vegetarianos',       re:/\bvegetarian/i},
  {key:'gluten_free',  label:'Sin Gluten / Trigo',  re:/\b(sin\s*gluten|gluten[\s-]?free|sin\s*trigo|celiac|cel[ií]ac[oa])/i},
  {key:'dairy_free',   label:'Sin Lácteos',         re:/\b(sin\s*lactosa|sin\s*l[aá]cteos|dairy[\s-]?free|lactose)/i},
  {key:'nut_allergy',  label:'Alergia a Nueces',    re:/\b(alergia\s*a\s*(la\s*)?nuez|alergia\s*a\s*nueces|sin\s*nueces|nut\s*allerg)/i},
  {key:'shellfish',    label:'Alergia a Mariscos',  re:/\b(alergia\s*a\s*mariscos|shellfish)/i},
  {key:'pescatarian',  label:'Pescetarianos',       re:/\bpesc[ae]tarian/i},
  {key:'keto',         label:'Keto',                re:/\bketo/i},
  {key:'no_pork',      label:'Sin Cerdo',           re:/\bsin\s*cerdo|no\s*pork/i},
  {key:'kosher',       label:'Kosher',              re:/\bkosher/i},
  {key:'halal',        label:'Halal',               re:/\bhalal/i},
];
function dietMatchNote(text){
  if(!text)return[];
  return DIET_CATEGORIES.filter(c=>c.re.test(text));
}
// Any note mentioning an allergy — whether or not it cleanly matched one of
// the counted categories above — is ALWAYS also shown verbatim rather than
// relying solely on the tally: a note like "Shellfish, nuts, avocado" matches
// the Shellfish category but would silently lose the nuts/avocado part if we
// only flagged notes with zero matches. This may be a life-threatening
// allergy, so staff should read the real words, not just a count.
function dietNoteNeedsReview(text){
  return!!text&&/allerg|alergia/i.test(text);
}

function dietWeekRange(anchor){
  const d=anchor?new Date(anchor+'T12:00:00'):new Date();
  const day=d.getDay(); // 0=Sun
  const monday=new Date(d);monday.setDate(d.getDate()-((day+6)%7));
  const sunday=new Date(monday);sunday.setDate(monday.getDate()+6);
  return{start:fmtISO(monday),end:fmtISO(sunday)};
}

function dietBuildReport(startDate,endDate){
  const groups=AppData.bookings.filter(bk=>bk.status!=='cancelled'&&bk.startDate<=endDate&&bk.endDate>=startDate)
    .sort((a,b)=>a.startDate.localeCompare(b.startDate));
  return groups.map(bk=>{
    const regs=AppData.regs.filter(r=>r.bookingId===bk.id);
    const tally={};
    const reviewNotes=[];
    regs.forEach(reg=>{
      (reg.guests||[]).forEach(g=>{
        if(!g.name)return;
        const note=g.notes||'';
        const matched=dietMatchNote(note);
        matched.forEach(c=>{tally[c.key]=(tally[c.key]||0)+1;});
        if(dietNoteNeedsReview(note))reviewNotes.push({name:g.name,note,room:reg.room||''});
      });
    });
    const tallyList=DIET_CATEGORIES.filter(c=>tally[c.key]>0).map(c=>({label:c.label,count:tally[c.key]}));
    return{bk,tallyList,reviewNotes};
  }).filter(g=>g.tallyList.length||g.reviewNotes.length);
}

function openDietaryReport(){
  const range=dietWeekRange();
  document.getElementById('dietRangeStart').value=range.start;
  document.getElementById('dietRangeEnd').value=range.end;
  dietRenderPreview();
  openModal('dietaryReportModal');
}
function dietRenderPreview(){
  const start=document.getElementById('dietRangeStart').value;
  const end=document.getElementById('dietRangeEnd').value;
  const body=document.getElementById('dietaryReportBody');if(!body)return;
  if(!start||!end||end<start){body.innerHTML='<div style="padding:16px;color:var(--muted);font-size:12.5px">Pick a valid date range.</div>';return;}
  const report=dietBuildReport(start,end);
  if(!report.length){body.innerHTML='<div style="padding:16px;color:var(--muted);font-size:12.5px;font-style:italic">No dietary or allergy notes found for this date range.</div>';return;}
  body.innerHTML=report.map(g=>`
    <div style="border:1.5px solid var(--border);border-radius:10px;padding:12px 16px;margin-bottom:10px">
      <div style="font-weight:700;color:var(--dark);font-size:13.5px;margin-bottom:6px">${escHtml(g.bk.leaderName||g.bk.retreatName||'Untitled')} <span style="font-weight:400;color:var(--muted);font-size:12px">· ${fmtDate(g.bk.startDate)}–${fmtDate(g.bk.endDate)}</span></div>
      ${g.tallyList.map(t=>`<div style="display:flex;justify-content:space-between;font-size:13px;padding:2px 0"><span>${escHtml(t.label)}</span><span style="font-weight:700">${t.count}</span></div>`).join('')}
      ${g.reviewNotes.length?`<div style="margin-top:6px;padding-top:6px;border-top:1px dashed #fca5a5;font-size:12px;color:#991b1b">⚠ Needs review: ${g.reviewNotes.map(r=>`${escHtml(r.name)} (${escHtml(r.note)})`).join('; ')}</div>`:''}
    </div>`).join('');
}
function dietPrintReport(){
  const start=document.getElementById('dietRangeStart').value;
  const end=document.getElementById('dietRangeEnd').value;
  if(!start||!end||end<start){showToast('Pick a valid date range first.');return;}
  const report=dietBuildReport(start,end);
  const groupsHtml=report.length?report.map(g=>`
    <div class="grp">
      <div class="grp-title">${escHtml(g.bk.leaderName||g.bk.retreatName||'Untitled')} <span class="grp-dates">${fmtDate(g.bk.startDate)}–${fmtDate(g.bk.endDate)}</span></div>
      ${g.tallyList.length?`<table>${g.tallyList.map(t=>`<tr><td class="cnt">${t.count}</td><td>${escHtml(t.label)}</td></tr>`).join('')}</table>`:'<div class="none">No categorized dietary notes.</div>'}
      ${g.reviewNotes.length?`<div class="review"><b>⚠ Needs review — read in full:</b><ul>${g.reviewNotes.map(r=>`<li>${escHtml(r.name)}${r.room?' (Room '+escHtml(r.room)+')':''}: "${escHtml(r.note)}"</li>`).join('')}</ul></div>`:''}
    </div>`).join('') : '<div class="none">No dietary or allergy notes found for this date range.</div>';
  const win=window.open('','_blank');
  win.document.write(`<!DOCTYPE html><html><head>
    <link rel="icon" type="image/png" href="/favicon.png"><title>Dietary Summary · ${fmtDate(start)}–${fmtDate(end)}</title>
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Jost:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
      *{box-sizing:border-box}
      body{font-family:'Jost',sans-serif;margin:0;padding:44px 48px;color:#2d2520;background:#fdfbf7;font-size:13pt;line-height:1.5}
      .print-btn{padding:9px 20px;background:#2d6a6a;color:#fff;border:none;border-radius:8px;cursor:pointer;font-family:'Jost',sans-serif;font-size:13pt;font-weight:600;float:right;margin-bottom:18px}
      .hdr{text-align:center;margin-bottom:26px}
      .title{font-family:'Cormorant Garamond',serif;font-size:28pt;font-weight:700;color:#1a2332;margin-bottom:4px;clear:both}
      .sub{font-size:12pt;letter-spacing:1.5px;color:#a89a86;text-transform:uppercase}
      .grp{border:1.5px solid #e8dfd4;border-radius:10px;padding:14px 20px;margin-bottom:16px;page-break-inside:avoid}
      .grp-title{font-family:'Cormorant Garamond',serif;font-size:18pt;font-weight:700;color:#1a2332}
      .grp-dates{font-size:11pt;color:#8a7e74;font-weight:400}
      table{width:100%;border-collapse:collapse;margin-top:8px}
      td{padding:4px 0;font-size:14pt}
      td.cnt{width:50px;font-weight:700;color:#2d6a6a}
      .none{color:#9ca3af;font-style:italic;font-size:12pt;margin-top:8px}
      .review{margin-top:10px;padding-top:8px;border-top:1.5px dashed #fca5a5;font-size:11.5pt;color:#991b1b}
      .review ul{margin:6px 0 0;padding-left:20px}
      @media print{.print-btn{display:none}}
    </style></head><body>
    <button class="print-btn" onclick="window.print()">Print</button>
    <div class="hdr">
      <div class="title">Dietary &amp; Allergy Summary</div>
      <div class="sub">${fmtDate(start)} – ${fmtDate(end)}</div>
    </div>
    ${groupsHtml}
  </body></html>`);
  win.document.close();
}
