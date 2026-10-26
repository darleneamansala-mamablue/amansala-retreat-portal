// Booking dates on Room Calendar bars: venues.js sets data-dates ("Oct 24 → Oct 27 · 3 nights")
// on each .bk bar; this file only styles it as a second line under the guest name.
(function(){
  if(document.getElementById('bdatesCss'))return;
  const st=document.createElement('style');st.id='bdatesCss';
  st.textContent='.bk[data-dates]{padding-bottom:12px;}'
   +'.bk[data-dates]::after{content:attr(data-dates);position:absolute;left:10px;right:6px;bottom:1px;font-size:10px;font-weight:700;line-height:1.1;opacity:.85;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;pointer-events:none;}';
  document.head.appendChild(st);
})();
