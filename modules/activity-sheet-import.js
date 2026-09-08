// ===== activity-sheet-import.js — ported from staging's new modular admin app =====
// (staging's own header credits it as "adapted from Darlene's portal")
// Read-only importer for completed activity sign-up sheets (.csv / .xlsx).
// No Supabase writes at all — pure client-side parsing and display, zero data risk.
// Loaded as a classic script; shares global scope with booking-hub.html (escHtml/showToast
// already exist globally — unlike staging's isolated ES module, no need to redefine them).

let aiSheets=[],aiResults=null;

// Renders into #actSheetImport — a container that already existed in booking-hub.html's
// Activity Sheet tab ("Import Sheet" sub-view, actSheetSetView('import')) waiting for this
// exact function; see modules/activity-sheet.js's actSheetSetView().
let _aiRendered=false;
function aiRender(){
  const el=document.getElementById('actSheetImport');
  if(!el)return;
  if(_aiRendered)return; // already built — actSheetSetView() just toggles display, don't wipe in-progress state
  _aiRendered=true;
  el.innerHTML=`<div style="max-width:960px">
    <div style="background:#fff;border:1px solid var(--border);border-radius:12px;padding:20px 24px;margin-bottom:16px">
      <div style="font-size:15px;font-weight:700;color:#111827;margin-bottom:6px">Import a Completed Sign-Up Sheet</div>
      <div style="font-size:12.5px;color:#6b7280;line-height:1.6;margin-bottom:14px">Upload a filled-in activity sign-up sheet (.csv, .xlsx) — guest names down the side, activities across the top, X's marked in. This pulls out the roster, each guest's personal schedule, the daily run-of-show, and revenue — the same way the printed sheet is laid out.</div>
      <input type="file" id="aiFileInput" accept=".csv,.xlsx,.xls" style="display:block;font-family:'Jost',sans-serif;font-size:13px" onchange="aiHandleFile(this.files[0])">
      <div id="aiSheetPicker" style="margin-top:14px;display:none"></div>
      <div id="aiStatus" style="margin-top:10px;font-size:12.5px;color:#9ca3af"></div>
    </div>
    <div id="aiResultsWrap"></div>
  </div>`;
}

function aiHandleFile(file){
  if(!file)return;
  const status=document.getElementById('aiStatus');
  status.textContent='Reading '+file.name+'…';
  document.getElementById('aiResultsWrap').innerHTML='';
  aiSheets=[];aiResults=null;

  const isCsv=/\.csv$/i.test(file.name);
  if(isCsv){
    const reader=new FileReader();
    reader.onload=e=>{
      aiSheets=[{name:file.name.replace(/\.csv$/i,''),rows:aiParseCSV(e.target.result)}];
      status.textContent='Loaded '+file.name+'.';
      aiShowSheetPicker();
    };
    reader.onerror=()=>{status.textContent='Could not read that file.';};
    reader.readAsText(file);
    return;
  }

  if(typeof XLSX==='undefined'){
    status.textContent='Spreadsheet reader loading…';
    const s=document.createElement('script');
    s.src='https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
    s.onload=()=>aiHandleFile(file);
    s.onerror=()=>{status.textContent='Could not load spreadsheet reader — try a .csv export instead.';};
    document.head.appendChild(s);
    return;
  }

  const reader=new FileReader();
  reader.onload=e=>{
    try{
      const wb=XLSX.read(new Uint8Array(e.target.result),{type:'array'});
      aiSheets=wb.SheetNames.map(name=>({
        name,
        rows:XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:'',raw:false})
          .map(row=>row.map(c=>(c===null||c===undefined)?'':String(c)))
      }));
      status.textContent='Loaded '+file.name+' — '+aiSheets.length+' tab'+(aiSheets.length!==1?'s':'')+'.';
      aiShowSheetPicker();
    }catch(err){status.textContent='Could not read that spreadsheet: '+err.message;}
  };
  reader.onerror=()=>{status.textContent='Could not read that file.';};
  reader.readAsArrayBuffer(file);
}

function aiParseCSV(text){
  const rows=[];
  let row=[],field='',inQuotes=false;
  for(let i=0;i<text.length;i++){
    const c=text[i],next=text[i+1];
    if(inQuotes){
      if(c==='"'&&next==='"'){field+='"';i++;}
      else if(c==='"'){inQuotes=false;}
      else field+=c;
    }else{
      if(c==='"')inQuotes=true;
      else if(c===',') {row.push(field);field='';}
      else if(c==='\r'){/* skip */}
      else if(c==='\n'){row.push(field);rows.push(row);row=[];field='';}
      else field+=c;
    }
  }
  if(field.length||row.length){row.push(field);rows.push(row);}
  return rows.filter(r=>r.some(c=>(c||'').trim()!==''));
}

function aiShowSheetPicker(){
  const wrap=document.getElementById('aiSheetPicker');
  if(aiSheets.length<=1){
    wrap.style.display='none';
    aiExtractAndRender(aiSheets.map(s=>s.name));
    return;
  }
  wrap.style.display='block';
  wrap.innerHTML=`<div style="font-size:11.5px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Multiple tabs found — pick which to process</div>
    <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px">
      ${aiSheets.map((s,i)=>`<label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer"><input type="checkbox" class="aiSheetCb" value="${i}" checked style="width:15px;height:15px;accent-color:#0f766e">${escHtml(s.name)}</label>`).join('')}
    </div>
    <button onclick="aiExtractSelected()" style="padding:8px 18px;background:#0f766e;color:#fff;border:none;border-radius:8px;font-family:'Jost',sans-serif;font-size:13px;font-weight:600;cursor:pointer">Extract Selected</button>`;
}

function aiExtractSelected(){
  const names=[...document.querySelectorAll('.aiSheetCb:checked')].map(cb=>aiSheets[parseInt(cb.value)].name);
  if(!names.length){showToast('Select at least one tab.');return;}
  aiExtractAndRender(names);
}

function aiExtractAndRender(sheetNames){
  aiResults=sheetNames.map(name=>{
    const sheet=aiSheets.find(s=>s.name===name);
    try{return{name,data:aiExtractSheet(sheet.rows)};}
    catch(e){return{name,error:e.message};}
  });
  document.getElementById('aiResultsWrap').innerHTML=aiResults.map((r,i)=>aiRenderResult(r,i)).join('');
}

function aiExtractSheet(rows){
  if(!rows.length)throw new Error('Empty sheet.');
  const colCount=Math.max(...rows.map(r=>r.length));

  let headerStart=-1;
  for(let i=0;i+4<rows.length;i++){
    let ok=true;
    for(let k=0;k<5&&ok;k++){
      const r=rows[i+k];
      if(!r){ok=false;break;}
      for(let c=1;c<colCount;c++){
        if(!(r[c]||'').trim()){ok=false;break;}
      }
    }
    if(ok){headerStart=i;break;}
  }
  if(headerStart===-1)throw new Error('Could not find the 5-row activity header block (Day/Date/Name/Time/Price). Check the sheet matches the expected layout.');

  const[dayRow,dateRow,nameRow,timeRow,priceRow]=rows.slice(headerStart,headerStart+5);
  const numCols=Math.max(dayRow.length,dateRow.length,nameRow.length,timeRow.length,priceRow.length);

  const activities=[];
  for(let c=1;c<numCols;c++){
    const name=(nameRow[c]||'').trim();
    if(!name)continue;
    const priceRaw=(priceRow[c]||'').trim();
    const prepaid=/^included$/i.test(priceRaw)||!priceRaw;
    const priceMatch=priceRaw.match(/[\d.]+/);
    activities.push({col:c,day:(dayRow[c]||'').trim(),date:(dateRow[c]||'').trim(),name,time:(timeRow[c]||'').trim(),priceRaw,prepaid,price:prepaid?0:(priceMatch?parseFloat(priceMatch[0]):0)});
  }
  if(!activities.length)throw new Error('Found the header rows but no activity columns had a name.');

  const metaRows=rows.slice(0,headerStart).map(r=>(r[0]||'').trim()).filter(Boolean);
  const groupName=metaRows[0]||'';
  const dateRangeRow=metaRows.find(t=>/[a-z]{3,9}\.?\s+\d{1,2}/i.test(t)&&/[-–—]/.test(t))||'';
  const minMatch=metaRows.join(' | ').match(/minimum of (\d+)/i);
  const minRequired=minMatch?parseInt(minMatch[1]):6;
  const paxMatch=metaRows.join(' | ').match(/#\s*(\d+)\s*of\s*pax/i);
  const statedPax=paxMatch?parseInt(paxMatch[1]):null;

  const guestRows=[];
  const footer={pax:[],guide1:[],guide2:[],van:[]};
  const flags=[];
  for(let i=headerStart+5;i<rows.length;i++){
    const label=(rows[i][0]||'').trim();
    if(!label)continue;
    if(/^#?\s*of\s*pax$/i.test(label)||/^#\s*pax$/i.test(label)){footer.pax=rows[i];continue;}
    if(/^guide\s*1$/i.test(label)){footer.guide1=rows[i];continue;}
    if(/^guide\s*2$/i.test(label)){footer.guide2=rows[i];continue;}
    if(/^van$/i.test(label)){footer.van=rows[i];continue;}
    guestRows.push(rows[i]);
  }

  const guests=guestRows.map(r=>{
    const name=(r[0]||'').trim();
    const marks={};
    activities.forEach(a=>{
      const raw=(r[a.col]||'').trim();
      if(!raw){marks[a.col]=false;return;}
      if(/^x$/i.test(raw)){marks[a.col]=true;}
      else{marks[a.col]=false;flags.push({type:'ambiguous_mark',guest:name,activity:a.name,value:raw});}
    });
    return{name,marks};
  });

  const roster=activities.map(a=>{
    const signedUp=guests.filter(g=>g.marks[a.col]).map(g=>g.name);
    const headcount=signedUp.length;
    const guide1=(footer.guide1[a.col]||'').trim();
    const guide2=(footer.guide2[a.col]||'').trim();
    const van=(footer.van[a.col]||'').trim();
    const meetsMin=headcount>=minRequired;
    const revenue=a.prepaid?0:headcount*a.price;
    if(headcount>0&&!meetsMin)flags.push({type:'below_minimum',activity:a.name,day:a.day,date:a.date,headcount,minRequired});
    if(headcount>0&&!guide1)flags.push({type:'missing_guide',activity:a.name,day:a.day,date:a.date});
    if(headcount>0&&/tour/i.test(a.name)&&!van)flags.push({type:'missing_van',activity:a.name,day:a.day,date:a.date});
    return{...a,signedUp,headcount,guide1,guide2,van,meetsMin,revenue};
  });

  const guestSchedules=guests.map(g=>{
    const items=activities.filter(a=>g.marks[a.col]).map(a=>({day:a.day,date:a.date,name:a.name,time:a.time,price:a.prepaid?0:a.price,prepaid:a.prepaid}));
    const total=items.reduce((sum,it)=>sum+(it.prepaid?0:it.price),0);
    return{name:g.name,items,total};
  });

  const dayKey=a=>a.day+' '+a.date;
  const dayOrder=[];
  activities.forEach(a=>{const k=dayKey(a);if(!dayOrder.includes(k))dayOrder.push(k);});
  const runOfShow=dayOrder.map(k=>({label:k,activities:roster.filter(a=>dayKey(a)===k).sort((a,b)=>(a.time||'').localeCompare(b.time||''))}));

  const revenueByActivity=roster.map(a=>({name:a.name,day:a.day,date:a.date,revenue:a.revenue}));
  const grandTotal=revenueByActivity.reduce((s,a)=>s+a.revenue,0);

  return{groupName,dateRangeRow,minRequired,statedPax,computedPax:guests.length,activities,roster,guestSchedules,runOfShow,revenueByActivity,grandTotal,flags};
}

function aiRenderResult(result,idx){
  if(result.error){
    return`<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:10px;padding:16px 20px;margin-bottom:20px">
      <div style="font-size:13.5px;font-weight:700;color:#991b1b">${escHtml(result.name)} — could not extract</div>
      <div style="font-size:12.5px;color:#7f1d1d;margin-top:4px">${escHtml(result.error)}</div>
    </div>`;
  }
  const d=result.data;
  const fmtDollar=n=>'$'+n.toLocaleString();

  const rosterRows=d.roster.map(a=>`<tr>
    <td style="padding:5px 8px">${escHtml(a.day)} ${escHtml(a.date)}</td>
    <td style="padding:5px 8px">${escHtml(a.name)}</td>
    <td style="padding:5px 8px">${escHtml(a.time)}</td>
    <td style="padding:5px 8px">${a.prepaid?'Included':fmtDollar(a.price)}</td>
    <td style="padding:5px 8px;text-align:center;font-weight:700;color:${a.meetsMin?'#059669':a.headcount>0?'#d97706':'#9ca3af'}">${a.headcount}</td>
    <td style="padding:5px 8px">${escHtml(a.guide1)||'—'}</td>
    <td style="padding:5px 8px">${escHtml(a.guide2)||'—'}</td>
    <td style="padding:5px 8px">${escHtml(a.van)||'—'}</td>
    <td style="padding:5px 8px;text-align:right">${a.prepaid?'—':fmtDollar(a.revenue)}</td>
  </tr>`).join('');

  const runOfShowHtml=d.runOfShow.map(day=>`<div style="margin-bottom:14px">
    <div style="font-size:12.5px;font-weight:700;color:#111827;margin-bottom:6px">${escHtml(day.label)}</div>
    ${day.activities.map(a=>`<div style="display:flex;justify-content:space-between;gap:10px;padding:5px 10px;background:#f9fafb;border-radius:6px;margin-bottom:4px;font-size:12.5px">
      <span>${escHtml(a.time)} — ${escHtml(a.name)}</span>
      <span style="color:#6b7280">${a.headcount} pax · ${escHtml(a.guide1)||'no guide'}${a.van?' · '+escHtml(a.van)+' van':''}</span>
    </div>`).join('')}
  </div>`).join('');

  const flagsHtml=d.flags.length?d.flags.map(f=>{
    if(f.type==='below_minimum')return`<li>⚠ <b>${escHtml(f.activity)}</b> (${escHtml(f.day)} ${escHtml(f.date)}) — only ${f.headcount} signed up, needs ${f.minRequired}.</li>`;
    if(f.type==='ambiguous_mark')return`<li>❓ Unclear mark for <b>${escHtml(f.guest)}</b> on <b>${escHtml(f.activity)}</b>: "${escHtml(f.value)}" — not counted.</li>`;
    if(f.type==='missing_guide')return`<li>👤 <b>${escHtml(f.activity)}</b> (${escHtml(f.day)} ${escHtml(f.date)}) has guests but no Guide 1 assigned.</li>`;
    if(f.type==='missing_van')return`<li>🚐 <b>${escHtml(f.activity)}</b> (${escHtml(f.day)} ${escHtml(f.date)}) is a tour with no van assigned.</li>`;
    return'';
  }).join(''):'<li style="color:#059669">No issues found.</li>';

  const guestHtml=d.guestSchedules.map(g=>`<div style="background:#fff;border:1px solid var(--border);border-radius:10px;padding:14px 18px;margin-bottom:10px">
    <div style="display:flex;justify-content:space-between;align-items:baseline">
      <div style="font-size:13.5px;font-weight:700;color:#111827">${escHtml(g.name)}</div>
      <div style="font-size:12.5px;font-weight:700;color:#7c3aed">${g.total>0?fmtDollar(g.total)+' owed':'—'}</div>
    </div>
    ${g.items.length?g.items.map(it=>`<div style="font-size:12px;color:#6b7280;margin-top:4px">${escHtml(it.day)} ${escHtml(it.date)} · ${escHtml(it.time)} — ${escHtml(it.name)}${it.prepaid?' (included)':' ('+fmtDollar(it.price)+')'}</div>`).join(''):'<div style="font-size:12px;color:#9ca3af;font-style:italic;margin-top:4px">Not signed up for anything.</div>'}
  </div>`).join('');

  return`<div style="background:#fff;border:1px solid var(--border);border-radius:12px;padding:20px 24px;margin-bottom:20px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;margin-bottom:16px">
      <div>
        <div style="font-size:16px;font-weight:700;color:#111827">${escHtml(d.groupName||result.name)}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:2px">${escHtml(d.dateRangeRow)} · ${d.computedPax} guests${d.statedPax&&d.statedPax!==d.computedPax?' (sheet said '+d.statedPax+')':''} · min ${d.minRequired}/activity</div>
      </div>
      <button onclick="aiPrintResult(${idx})" style="padding:7px 14px;background:#0f766e;color:#fff;border:none;border-radius:8px;font-family:'Jost',sans-serif;font-size:12.5px;font-weight:600;cursor:pointer">🖨 Print Summary</button>
    </div>

    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#6b7280;margin-bottom:8px">Flags</div>
    <ul style="font-size:12.5px;color:#111827;line-height:1.9;margin:0 0 18px;padding-left:18px">${flagsHtml}</ul>

    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#6b7280;margin-bottom:8px">Activity Roster</div>
    <div style="overflow-x:auto;margin-bottom:18px">
      <table style="width:100%;border-collapse:collapse;font-size:12.5px">
        <thead><tr style="background:#f9fafb"><th style="text-align:left;padding:6px 8px;border-bottom:2px solid #e5e7eb">Day</th><th style="text-align:left;padding:6px 8px;border-bottom:2px solid #e5e7eb">Activity</th><th style="text-align:left;padding:6px 8px;border-bottom:2px solid #e5e7eb">Time</th><th style="text-align:left;padding:6px 8px;border-bottom:2px solid #e5e7eb">Price</th><th style="padding:6px 8px;border-bottom:2px solid #e5e7eb">Pax</th><th style="text-align:left;padding:6px 8px;border-bottom:2px solid #e5e7eb">Guide 1</th><th style="text-align:left;padding:6px 8px;border-bottom:2px solid #e5e7eb">Guide 2</th><th style="text-align:left;padding:6px 8px;border-bottom:2px solid #e5e7eb">Van</th><th style="text-align:right;padding:6px 8px;border-bottom:2px solid #e5e7eb">Revenue</th></tr></thead>
        <tbody>${rosterRows}</tbody>
        <tfoot><tr style="font-weight:700;background:#f9fafb"><td colspan="8" style="padding:6px 8px;text-align:right">Grand Total</td><td style="padding:6px 8px;text-align:right">${fmtDollar(d.grandTotal)}</td></tr></tfoot>
      </table>
    </div>

    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#6b7280;margin-bottom:8px">Daily Run-of-Show</div>
    <div style="margin-bottom:18px">${runOfShowHtml}</div>

    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#6b7280;margin-bottom:8px">Per-Guest Schedules</div>
    ${guestHtml}
  </div>`;
}

function aiPrintResult(idx){
  const result=aiResults?.[idx];
  if(!result||result.error)return;
  const d=result.data;
  const fmtDollar=n=>'$'+n.toLocaleString();
  const win=window.open('','_blank');
  const rosterRows=d.roster.map(a=>`<tr><td>${escHtml(a.day)} ${escHtml(a.date)}</td><td>${escHtml(a.name)}</td><td>${escHtml(a.time)}</td><td>${a.prepaid?'Included':fmtDollar(a.price)}</td><td style="text-align:center">${a.headcount}</td><td>${escHtml(a.guide1)||'—'}</td><td>${escHtml(a.guide2)||'—'}</td><td>${escHtml(a.van)||'—'}</td><td style="text-align:right">${a.prepaid?'—':fmtDollar(a.revenue)}</td></tr>`).join('');
  const guestBlocks=d.guestSchedules.map(g=>`<div style="break-inside:avoid;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #e5e7eb"><b>${escHtml(g.name)}</b>${g.total>0?' — '+fmtDollar(g.total)+' owed':''} ${g.items.map(it=>`<div style="font-size:12px;color:#4b5563">${escHtml(it.day)} ${escHtml(it.date)} · ${escHtml(it.time)} — ${escHtml(it.name)}${it.prepaid?' (included)':' ('+fmtDollar(it.price)+')'}</div>`).join('')||'<div style="font-size:12px;color:#9ca3af;font-style:italic">Not signed up.</div>'}</div>`).join('');
  win.document.write(`<!DOCTYPE html><html><head><title>Extracted Schedule — ${escHtml(d.groupName)}</title><style>body{font-family:Arial,sans-serif;padding:28px;color:#1a1a1a}table{width:100%;border-collapse:collapse;font-size:12.5px;margin-bottom:24px}th,td{border:1px solid #ccc;padding:5px 8px;text-align:left}@media print{.no-print{display:none}}</style></head><body><button class="no-print" onclick="window.print()" style="padding:8px 16px;float:right">Print</button><h2>${escHtml(d.groupName)}</h2><p style="color:#6b7280">${escHtml(d.dateRangeRow)} · ${d.computedPax} guests</p><h3>Activity Roster</h3><table><thead><tr><th>Day</th><th>Activity</th><th>Time</th><th>Price</th><th>Pax</th><th>Guide 1</th><th>Guide 2</th><th>Van</th><th>Revenue</th></tr></thead><tbody>${rosterRows}</tbody></table><h3>Per-Guest Schedules</h3>${guestBlocks}</body></html>`);
  win.document.close();
  setTimeout(()=>win.print(),400);
}
