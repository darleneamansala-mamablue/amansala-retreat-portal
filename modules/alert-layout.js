// ===== alert-layout.js — layout only for the admin alert banners (Casita 4 + Casa Shanti) =====
// Loaded as a classic script AFTER casa-shanti-alert.js and casita4-alert.js. Changes nothing in those modules: it only adds CSS and a
// small header to each banner, so that
//   - the two banners sit side by side and take less room (they stack again on a narrow screen),
//   - each one is an accordion: collapsed to one line ("Admin alert · Casita 4 · 15 ▸") and opens when clicked,
//   - each one has an X to close it.
// Open / closed state is remembered for this browser session only; the banners start collapsed each time the portal is opened.
(function(){
  const KINDS=[{cls:'c4-alert',key:'c4',toggle:'c4Toggle'},{cls:'cs-alert',key:'cs',toggle:'csToggle'}];
  const root=document.documentElement;
  const css=KINDS.map(k=>`html[data-hide-${k.key}] .${k.cls}{display:none!important}
html:not([data-open-${k.key}]) .${k.cls}>*:not(.al-head):not(.al-x){display:none!important}
.${k.cls}>.al-head+*{display:none!important}`).join('\n')+`
.c4-alert,.cs-alert{position:relative;display:inline-block;vertical-align:top;box-sizing:border-box;width:calc(50% - 34px);margin:8px 16px 0!important;padding:6px 32px 6px 12px!important}
@media (max-width:900px){.c4-alert,.cs-alert{display:block;width:auto;margin:8px 16px 0!important}}
.al-head{display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none;font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#92400e}
.al-head .al-n{background:#92400e;color:#fff;border-radius:10px;padding:1px 8px;font-size:11px;letter-spacing:0}
.al-head .al-chev{margin-left:auto;font-size:12px}
.al-x{position:absolute;top:4px;right:6px;width:22px;height:22px;line-height:20px;text-align:center;padding:0;border:none;background:transparent;color:#92400e;font-size:16px;font-weight:700;cursor:pointer;border-radius:6px}
.al-x:hover{background:#fde68a}`;
  const st=document.createElement('style');st.id='alertLayoutCss';st.textContent=css;document.head.appendChild(st);

  function get(n){try{return sessionStorage.getItem(n)==='1';}catch(e){return false;}}
  function put(n,v){try{v?sessionStorage.setItem(n,'1'):sessionStorage.removeItem(n);}catch(e){}}
  KINDS.forEach(k=>{
    if(get('alhide_'+k.key))root.setAttribute('data-hide-'+k.key,'1');
    if(get('alopen_'+k.key))root.setAttribute('data-open-'+k.key,'1');
  });

  function countOf(el){
    const m=(el.textContent||'').match(/available for (\d+) retreat/);
    if(m)return m[1];
    return String([...el.querySelectorAll('button')].filter(b=>/dismiss/i.test(b.textContent)).length||'');
  }
  function decorate(){
    KINDS.forEach(k=>{
      document.querySelectorAll('.'+k.cls).forEach(el=>{
        if(el.querySelector(':scope > .al-head'))return;
        const title=((el.firstElementChild&&el.firstElementChild.textContent)||'Admin alert').trim();
        const head=document.createElement('div');head.className='al-head';
        const open=root.hasAttribute('data-open-'+k.key);
        head.innerHTML='<span class="al-t"></span><span class="al-n"></span><span class="al-chev"></span>';
        head.querySelector('.al-t').textContent=title;
        const n=countOf(el);const nb=head.querySelector('.al-n');if(n)nb.textContent=n;else nb.style.display='none';
        head.querySelector('.al-chev').textContent=open?'▾':'▸';
        head.onclick=function(){
          const nowOpen=!root.hasAttribute('data-open-'+k.key);
          if(nowOpen)root.setAttribute('data-open-'+k.key,'1');else root.removeAttribute('data-open-'+k.key);
          put('alopen_'+k.key,nowOpen);
          // more than 3 alerts: the module itself keeps the list folded behind its own "Show list" button; open it too
          if(nowOpen&&!el.querySelector('[style*="max-height"]')&&typeof window[k.toggle]==='function'){try{window[k.toggle]();return;}catch(e){}}
          head.querySelector('.al-chev').textContent=nowOpen?'▾':'▸';
        };
        el.insertBefore(head,el.firstChild);
        const b=document.createElement('button');
        b.type='button';b.className='al-x';b.title='Close';b.setAttribute('aria-label','Close');b.textContent='×';
        b.onclick=function(e){e.stopPropagation();root.setAttribute('data-hide-'+k.key,'1');put('alhide_'+k.key,true);};
        el.appendChild(b);
      });
    });
  }
  let t=null;
  new MutationObserver(function(){clearTimeout(t);t=setTimeout(decorate,50);}).observe(document.body,{childList:true,subtree:true});
  decorate();
})();
