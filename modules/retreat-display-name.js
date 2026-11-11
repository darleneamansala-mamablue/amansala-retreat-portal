// Shows a booking's Retreat Name (e.g. "Go Yoga") instead of the contract signer
// (e.g. "Molly Morgan") on the operations screens. Contracts, billing, forms and
// the booking editor keep the signer's name. Text only: nothing is saved or changed.
(function(){
  var TABS=['tab-dashboard','tab-venues','tab-roomcal','tab-skedda','tab-housekeeping','tab-transport','tab-events','tab-menu','tab-actsheet','tab-activity','tab-bbcsched','tab-confirmations','tab-wetravel'];
  var SKIP={INPUT:1,TEXTAREA:1,SELECT:1,OPTION:1,SCRIPT:1,STYLE:1};
  var map=[],queued=false,busy=false;

  function buildMap(){
    var seen={},out=[];
    var types=(typeof RM_TYPE_COLORS!=='undefined')?RM_TYPE_COLORS:{};
    ((typeof AppData!=='undefined'&&AppData.bookings)||[]).forEach(function(b){
      // retreats only: a Room Only / Extra Night booking's "leader" is the guest and its "retreat name" is the kind of stay
      // ("Extra Night", "Walk-in"...) -- swapping those turned guests' names into "Extra Night" on Rooms (Jorge 2026-11-11, GV18)
      if(b.bookingType==='room_only'||b.status==='cancelled')return;
      var l=(b.leaderName||'').trim(),r=(b.retreatName||'').trim();
      if(/extra\s*night|walk-?in|direct|ota\b|cloudbeds|escape|booking\.com|expedia|air\s*bnb/i.test(r))return;
      if(!l||!r||l.length<4||l.toLowerCase()===r.toLowerCase())return;
      if(types[r]||/^🚧/.test(l))return;
      if(seen[l]&&seen[l]!==r){seen[l]=null;return;}
      seen[l]=r;
    });
    Object.keys(seen).forEach(function(l){if(seen[l])out.push([l,seen[l]]);});
    out.sort(function(a,b){return b[0].length-a[0].length;});
    return out;
  }

  function skipNode(n){
    for(var e=n.parentNode;e&&e.nodeType===1;e=e.parentNode){
      if(SKIP[e.tagName]||e.isContentEditable)return true;
      // a room bar with a guest in it shows that guest's own name (the leader in her own room stays "Molly Morgan");
      // only a blocked room without a guest shows the retreat
      if(e.classList&&e.classList.contains('bk')&&!/blocked/.test(e.textContent||''))return true;
    }
    return false;
  }

  function run(){
    queued=false;if(busy)return;busy=true;
    try{
      map=buildMap();if(!map.length)return;
      TABS.forEach(function(id){
        var root=document.getElementById(id);if(!root||!root.offsetParent&&root.style.display==='none')return;
        var w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,null),n,list=[];
        while((n=w.nextNode()))list.push(n);
        list.forEach(function(t){
          var v=t.nodeValue;if(!v||v.length<4||skipNode(t))return;
          var nv=v;
          map.forEach(function(p){if(nv.indexOf(p[0])>=0)nv=nv.split(p[0]).join(p[1]);});
          if(nv!==v)t.nodeValue=nv;
        });
      });
    }catch(e){}finally{busy=false;}
  }

  function queue(){if(queued||busy)return;queued=true;setTimeout(run,120);}

  function start(){
    new MutationObserver(queue).observe(document.body,{childList:true,subtree:true,characterData:true});
    queue();
  }
  if(document.body)start();else document.addEventListener('DOMContentLoaded',start);
})();
