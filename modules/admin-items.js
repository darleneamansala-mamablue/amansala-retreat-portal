// ===== admin-items.js — ported from staging's new modular admin app (js/modules/admin-items.js) =====
// Loaded as a classic script; shares global scope with booking-hub.html (same pattern as cb-portal-sync.js).
// The `items` Supabase table + netlify/functions/cloudbeds.js's `getItems` action already existed in
// portal unused — this is purely the missing frontend viewer/editor for that data.

let _adminItems=[];

async function adminItemsRender(){
  const el=document.getElementById('itemsContent');
  if(!el)return;
  el.innerHTML=`
    <div style="max-width:900px;margin:0 auto;padding:28px 24px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px">
        <h2 style="font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:600;color:var(--dark);margin:0">Items</h2>
        <div style="display:flex;gap:8px">
          <button onclick="adminItemsSyncCb()" class="btn btn-secondary" style="color:#1d4ed8;border-color:#1d4ed8">↻ Sync from Cloudbeds</button>
          <button onclick="adminItemsShowAddForm()" class="btn btn-primary">+ Add Item</button>
        </div>
      </div>
      <div id="items-form-wrap" style="display:none;background:#f0fdf4;border:1.5px solid #6ee7b7;border-radius:10px;padding:16px 20px;margin-bottom:18px">
        <div style="font-size:13px;font-weight:700;color:#065f46;margin-bottom:12px" id="items-form-title">Add Item</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
          <div style="flex:2;min-width:160px">
            <label style="font-size:11px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Name *</label>
            <input id="items-f-name" placeholder="Item name" style="width:100%;padding:7px 10px;border:1.5px solid #d1d5db;border-radius:7px;font-size:13px;box-sizing:border-box">
          </div>
          <div style="flex:1;min-width:100px">
            <label style="font-size:11px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Price (USD)</label>
            <input id="items-f-price" type="number" min="0" step="0.01" placeholder="0.00" style="width:100%;padding:7px 10px;border:1.5px solid #d1d5db;border-radius:7px;font-size:13px;box-sizing:border-box;text-align:right">
          </div>
          <div style="flex:0 0 80px;min-width:70px">
            <label style="font-size:11px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Tax %</label>
            <input id="items-f-tax" type="number" min="0" max="100" step="0.01" placeholder="16" style="width:100%;padding:7px 10px;border:1.5px solid #d1d5db;border-radius:7px;font-size:13px;box-sizing:border-box;text-align:right">
          </div>
          <div style="flex:1;min-width:120px">
            <label style="font-size:11px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Category</label>
            <input id="items-f-cat" placeholder="General" style="width:100%;padding:7px 10px;border:1.5px solid #d1d5db;border-radius:7px;font-size:13px;box-sizing:border-box">
          </div>
          <div style="display:flex;gap:6px">
            <button onclick="adminItemsSaveForm()" class="btn btn-primary">Save</button>
            <button onclick="adminItemsCancelForm()" class="btn btn-secondary">Cancel</button>
          </div>
        </div>
        <input type="hidden" id="items-f-id">
      </div>
      <div style="background:#fff;border-radius:12px;border:1px solid var(--border);overflow:hidden">
        <div id="items-table-wrap"><div style="padding:40px;text-align:center;color:var(--muted)">Loading…</div></div>
      </div>
    </div>`;
  await adminItemsLoad();
}

async function adminItemsLoad(){
  try{
    const{data,error}=await db.from('items').select('*').eq('active',true).order('category').order('name');
    if(error)throw error;
    _adminItems=data||[];
    adminItemsRenderTable(_adminItems);
  }catch(e){adminItemsRenderTable([]);showToast('Error loading items: '+e.message);}
}

function adminItemsRenderTable(items){
  const wrap=document.getElementById('items-table-wrap');
  if(!wrap)return;
  if(!items.length){
    wrap.innerHTML=`<div style="padding:40px;text-align:center;color:var(--muted);font-size:13px">No items yet. Add one manually or sync from Cloudbeds.</div>`;
    return;
  }
  const groups={};
  items.forEach(it=>{const c=it.category||'General';(groups[c]=groups[c]||[]).push(it);});
  let html=`<table style="width:100%;border-collapse:collapse">
    <thead><tr style="background:#f9fafb;border-bottom:1px solid var(--border)">
      <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase">Category</th>
      <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase">Name</th>
      <th style="padding:10px 16px;text-align:right;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase">Price</th>
      <th style="padding:10px 16px;text-align:center;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase">Tax</th>
      <th style="padding:10px 16px;text-align:center;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase">Source</th>
      <th style="padding:10px 16px;width:110px"></th>
    </tr></thead><tbody>`;
  let rowIdx=0;
  for(const[cat,catItems]of Object.entries(groups).sort()){
    catItems.forEach((it,i)=>{
      const iid=escHtml(it.id);
      const src=it.source==='cloudbeds'
        ?`<span style="font-size:10px;font-weight:700;color:#1d4ed8;background:#eff6ff;padding:2px 7px;border-radius:8px">CB</span>`
        :`<span style="font-size:10px;font-weight:700;color:#15803d;background:#f0fdf4;padding:2px 7px;border-radius:8px">Manual</span>`;
      html+=`<tr style="border-bottom:1px solid #f3f4f6${rowIdx%2?';background:#fafafa':''}">
        <td style="padding:9px 16px;font-size:12px;color:var(--muted)">${i===0?escHtml(cat):''}</td>
        <td style="padding:9px 16px;font-size:13px;color:var(--dark);font-weight:500">${escHtml(it.name)}</td>
        <td style="padding:9px 16px;font-size:13px;color:#374151;text-align:right;font-weight:600">$${Number(it.price).toFixed(2)}</td>
        <td style="padding:9px 16px;font-size:12px;color:var(--muted);text-align:center">${it.tax_rate!=null?Number(it.tax_rate).toFixed(0)+'%':'—'}</td>
        <td style="padding:9px 16px;text-align:center">${src}</td>
        <td style="padding:9px 16px;text-align:right;white-space:nowrap">
          <button onclick="adminItemsEditForm('${iid}')" style="background:none;border:1px solid #d1d5db;color:#374151;font-size:11px;padding:3px 9px;border-radius:5px;cursor:pointer;margin-right:4px">Edit</button>
          <button onclick="adminItemsDelete('${iid}')" style="background:none;border:none;color:#d1d5db;font-size:15px;cursor:pointer;padding:0" onmouseover="this.style.color='#dc2626'" onmouseout="this.style.color='#d1d5db'">✕</button>
        </td>
      </tr>`;
      rowIdx++;
    });
  }
  html+='</tbody></table>';
  wrap.innerHTML=html;
}

function adminItemsShowAddForm(){
  document.getElementById('items-f-id').value='';
  document.getElementById('items-f-name').value='';
  document.getElementById('items-f-price').value='';
  document.getElementById('items-f-tax').value='16';
  document.getElementById('items-f-cat').value='';
  document.getElementById('items-form-title').textContent='Add Item';
  document.getElementById('items-form-wrap').style.display='block';
  document.getElementById('items-f-name').focus();
}
function adminItemsEditForm(itemId){
  const it=_adminItems.find(i=>i.id===itemId);if(!it)return;
  document.getElementById('items-f-id').value=it.id;
  document.getElementById('items-f-name').value=it.name;
  document.getElementById('items-f-price').value=Number(it.price).toFixed(2);
  document.getElementById('items-f-tax').value=it.tax_rate!=null?Number(it.tax_rate).toFixed(2):'16';
  document.getElementById('items-f-cat').value=it.category||'';
  document.getElementById('items-form-title').textContent='Edit Item';
  document.getElementById('items-form-wrap').style.display='block';
  document.getElementById('items-f-name').focus();
}
function adminItemsCancelForm(){document.getElementById('items-form-wrap').style.display='none';}

async function adminItemsSaveForm(){
  const id=document.getElementById('items-f-id').value.trim();
  const name=document.getElementById('items-f-name').value.trim();
  const price=parseFloat(document.getElementById('items-f-price').value)||0;
  const cat=document.getElementById('items-f-cat').value.trim()||'General';
  const tax=parseFloat(document.getElementById('items-f-tax').value)||0;
  if(!name){showToast('Name is required');return;}
  try{
    const now=new Date().toISOString();
    if(id){
      const{error}=await db.from('items').update({name,price,category:cat,tax_rate:tax,updated_at:now}).eq('id',id);
      if(error)throw error;
      showToast('Item updated');
    }else{
      const{error}=await db.from('items').insert({name,price,category:cat,tax_rate:tax,source:'manual',active:true,created_at:now,updated_at:now});
      if(error)throw error;
      showToast('Item added');
    }
    adminItemsCancelForm();
    await adminItemsLoad();
  }catch(e){showToast('Error: '+e.message);}
}

async function adminItemsDelete(itemId){
  if(!confirm('Remove this item?'))return;
  try{
    const{error}=await db.from('items').update({active:false,updated_at:new Date().toISOString()}).eq('id',itemId);
    if(error)throw error;
    showToast('Item removed');
    await adminItemsLoad();
  }catch(e){showToast('Error: '+e.message);}
}

async function adminItemsSyncCb(){
  try{
    showToast('Syncing items from Cloudbeds…');
    const resp=await fetch(`${CLOUDBEDS_PROXY}?action=getItems`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    const data=await resp.json();
    const cbItems=data.items||[];
    if(!cbItems.length){showToast('No items returned from Cloudbeds');return;}
    const now=new Date().toISOString();
    const rows=cbItems.map(item=>({
      name:(item.itemName||item.name||'').trim(),
      price:parseFloat(item.itemUnitPrice??item.itemPrice??item.price??item.unitPrice??0),
      category:(item.itemCategoryName||item.categoryName||'General').trim(),
      source:'cloudbeds',
      cb_item_id:String(item.itemID||item.id),
      active:true,
      tax_rate:16,
      updated_at:now,
    }));
    const{error}=await db.from('items').upsert(rows,{onConflict:'cb_item_id',ignoreDuplicates:false});
    if(error)throw error;
    showToast(`Synced ${cbItems.length} items from Cloudbeds`);
    await adminItemsLoad();
  }catch(e){showToast('Sync failed: '+e.message);}
}
