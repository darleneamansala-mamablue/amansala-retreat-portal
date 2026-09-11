// ===== teacher-pricelist.js — teacher-facing "Price List" tab =====
// A simple rate card by room type (private/shared), with tax, tip, and package
// cost broken out — adapted from openPriceList()'s room-type table (modules/pricing.js),
// which is admin-only (#regPriceListBtn is hidden in teacher-mode). Uses the same
// rate/tax/package helpers as calcBD()/renderEstQuote() so the numbers always agree.
function renderTeacherPriceList(){
  if(!regSelBk)return;
  const wrap=document.getElementById('teacherPriceListBody');if(!wrap)return;
  const nights=getNights(regSelBk);
  const blockedSet=new Set(regSelBk.blockedRooms||[]);
  const tipR=getTip(regSelBk);
  const pkgTr=getBkTaxRate(regSelBk);
  const pkgItems=calcPkgItems(regSelBk);

  let html=`<table class="pl-table"><thead><tr><th>Room</th><th>Nightly Rate</th><th>Room Subtotal</th><th>Package</th><th>Tax</th><th>Tip</th><th>Total</th></tr></thead><tbody>`;
  AppData.roomTypes.slice().sort((a,b)=>_roomSortKey(a)-_roomSortKey(b)).forEach(rt=>{
    if(blockedSet.size>0&&!rt.rooms.some(r=>blockedSet.has(r)))return;
    html+=`<tr class="pl-type-row"><td colspan="7"><div style="display:flex;align-items:center;gap:8px"><div style="width:10px;height:10px;border-radius:50%;background:${rt.color};flex-shrink:0"></div><span style="font-weight:700">${rt.name}</span></div></td></tr>`;
    for(let gc=1;gc<=rt.maxOcc;gc++){
      const rate=getRoomRate(rt,gc,regSelBk.startDate,nights);
      const base=+(rate*gc*nights).toFixed(2);
      const pkg=+(calcPkgCost(regSelBk,gc)).toFixed(2);
      const roomTax=+(base*0.16).toFixed(2);
      const pkgTax=+(pkg*pkgTr).toFixed(2);
      const tax=+(roomTax+pkgTax).toFixed(2);
      const tip=+(tipR*gc*nights).toFixed(2);
      const total=+(base+pkg+tax+tip).toFixed(2);
      const lbl=rt.maxOcc===1?'Private (1 guest)':gc===1?'1 guest':gc===rt.maxOcc?`${gc} guests (max)`:`${gc} guests`;
      html+=`<tr><td>${lbl}</td><td>${fmt$(rate)}/nt</td><td>${fmt$(base)}</td><td>${pkg>0?fmt$(pkg):'—'}</td><td>${fmt$(tax)}</td><td>${fmt$(tip)}</td><td class="pl-grand-td">${fmt$(total)}</td></tr>`;
    }
  });
  html+=`</tbody></table>`;
  if(pkgItems.length){
    html+=`<div style="margin-top:14px;font-size:11.5px;color:#8a7e74">Package includes: ${pkgItems.map(a=>a.name).join(', ')} — taxed at ${Math.round(pkgTr*100)}%. Room rate taxed at 16%. Gratuity $${tipR}/guest/night.</div>`;
  }
  wrap.innerHTML=html;
}
