/* retreat-booking-house.js: the whole-house sections (Casa Master and Casita 4) of retreat-booking.html. One independent section per house
   (own cart, own checkout), built by create() below.
   Guests choose bedrooms one by one, enter every guest (adult or child, with a child's age), and pay for all chosen rooms together
   with one card. Prices shown here come from the server (retreat-booking-info -> rb-house-lib); the amount charged is recalculated
   on the server by retreat-booking-house-intent. Self-contained: it only needs window.rbHouse.init(INFO) and the Stripe.js global. */
(function () {
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function money(x) { return '$' + Number(x || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function opt(r, n) { return r.options.filter(function (o) { return o.n === n; })[0]; }
  function occLabel(r, n) {
    if (r.kind === 'twin') return '2 guests (both beds)';
    if (r.kind === 'single') return '1 guest';
    if (r.kind === 'kingx') return n === 1 ? '1 guest · king bed' : n === 2 ? '2 guests · sharing the king bed' : '3 guests · king bed + individual bed';
    return n === 1 ? '1 guest' : '2 guests · sharing the king bed';
  }
  function rateLine(r) {
    if (r.kind === 'twin') return '$' + r.shareRate + ' per person · per night';
    if (r.kind === 'single') return '$' + r.soloRate + ' private · per night';
    return '$' + r.soloRate + ' private · $' + r.shareRate + ' per person sharing · per night';
  }
  var CSS = '.hsec{max-width:1280px;margin:0 auto;padding:0 0 40px}.hsec .hgrid{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:32px;align-items:start}' +
    '.hsec .hroom{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:24px;padding:24px 0;border-top:1px solid var(--line)}' +
    '.hsec .himg{width:100%;aspect-ratio:1.4;object-fit:cover;background:var(--sand);display:block}.hsec .hph{width:100%;aspect-ratio:1.4;background:var(--sand);display:flex;align-items:center;justify-content:center;color:#7a705c;font-size:13px}' +
    '.hsec .hthumbs{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;margin-top:8px}.hsec .hthumb{padding:0;border:2px solid transparent;background:none;cursor:pointer;line-height:0}.hsec .hthumb.on{border-color:var(--moss)}.hsec .hthumb img{width:100%;aspect-ratio:1.3;object-fit:cover;display:block}' +
    '.hsec .hgal{margin:8px 0 28px;max-width:760px}.hsec .hgalthumbs{grid-template-columns:repeat(7,minmax(0,1fr))}.hsec .hgal .hgalmain{aspect-ratio:1.6}.hsec h3{font-family:var(--display);font-weight:400;font-size:30px;margin:0}.hsec .hmeta{color:#5b5a50;font-size:14px;margin:2px 0 10px}' +
    '.hsec .hnote{background:#fbf3df;border-left:3px solid #c9972b;padding:10px 12px;font-size:13.5px;margin:10px 0}' +
    '.hsec .hocc{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.hsec .hocc button{border:1.5px solid var(--line);background:var(--paper);padding:9px 14px;cursor:pointer;font:inherit;font-size:13.5px;color:inherit}.hsec .hocc button.on{border-color:var(--moss);background:var(--moss);color:#fff}' +
    '.hsec .hg{display:grid;grid-template-columns:1fr 110px 70px;gap:8px;margin-bottom:8px}.hsec .hg input,.hsec .hg select{padding:9px 10px;border:1px solid var(--line);background:#fff;font:inherit;font-size:14px;border-radius:0;min-width:0}' +
    '.hsec .hprice{display:flex;justify-content:space-between;align-items:baseline;gap:12px;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:10px 0;margin:10px 0;font-size:14px}.hsec .hprice b{font-family:var(--display);font-size:30px;font-weight:500}' +
    '.hsec .hadd{width:100%;background:#1f2b27;color:#fff;border:0;padding:13px;font:inherit;letter-spacing:.08em;text-transform:uppercase;font-size:13px;cursor:pointer}.hsec .hadd:disabled{opacity:.4;cursor:not-allowed}' +
    '.hsec .herr{color:#8a2b1f;font-size:13px;margin-top:4px}.hsec .hsold{color:#8a2b1f;font-weight:600;margin:8px 0}' +
    '.hsec .hcart{position:sticky;top:16px;background:var(--paper);border:1px solid var(--line);padding:18px}.hsec .hcart h4{font-family:var(--display);font-weight:400;font-size:24px;margin:0 0 8px}' +
    '.hsec .hcl{border-top:1px solid var(--line);padding:10px 0;font-size:13.5px}.hsec .hcl .t{display:flex;justify-content:space-between;gap:8px;font-weight:600}.hsec .hcl small{display:block;color:#5b5a50;font-weight:400}.hsec .hcl .row{display:flex;justify-content:space-between;gap:8px;color:#5b5a50}.hsec .hcl button{border:0;background:none;color:#8a2b1f;cursor:pointer;font-size:12px;padding:0;margin-top:4px}' +
    '.hsec .htot{border-top:2px solid #1f2b27;margin-top:8px;padding-top:10px;display:flex;justify-content:space-between;font-weight:600;font-size:17px}' +
    '.hbgm{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:none;align-items:flex-start;justify-content:center;padding:24px 12px;overflow:auto}.hbgm.open{display:flex}.hbgm .hmodal{background:var(--paper,#fffdf8);max-width:560px;width:100%;padding:26px;position:relative}' +
    '.hbgm label{display:block;font-size:13px;margin:10px 0 0}.hbgm input[type=text],.hbgm input[type=email],.hbgm input[type=tel]{width:100%;padding:10px 12px;border:1px solid var(--line);background:#fff;font:inherit;font-size:14px;border-radius:0;margin-top:4px}' +
    '.hbgm .hx{position:absolute;right:12px;top:8px;border:0;background:none;font-size:26px;cursor:pointer}.hbgm .hline{display:flex;justify-content:space-between;gap:8px;font-size:13.5px;padding:3px 0}' +
    '.hsec .hdates{max-width:720px;margin-top:4px}.hsec .hdates .row2{display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end}.hsec .hdates label{display:flex;flex-direction:column;font-size:12.5px;color:#6b6a5f;gap:4px}.hsec .hdates input{padding:9px 10px;border:1px solid var(--line);background:#fff;font:inherit;font-size:14px;border-radius:0}.hsec .hdn{display:flex;flex-direction:column;font-size:13px;padding-bottom:4px}.hsec .hdn span{color:#6b6a5f;font-size:12.5px}.hsec .hhint{font-size:13px;color:#5b5a50;margin:8px 0 0}' +
    '@media(max-width:900px){.hsec .hgrid{grid-template-columns:1fr}.hsec .hroom{grid-template-columns:1fr}.hsec .hcart{position:static}.hsec .hg{grid-template-columns:1fr 100px 60px}}';

  function create(opts) {
    var P = opts.P || '', INFO = null, HOUSE = null, pick = {}, saved = {}, cart = [], stripe = null, elements = null, bookingId = '', doneInfo = null;
    function $p(id) { return document.getElementById(P + id); }
    function room(id) { return HOUSE.rooms.filter(function (r) { return r.id === id; })[0]; }
  function init(info) {
    INFO = info; HOUSE = info && opts.pick(info); bookingId = info && info.bookingId;
    var host = $p('house');
    if (!host) return;
    if (!HOUSE || !HOUSE.rooms || !HOUSE.rooms.length) { host.hidden = true; host.innerHTML = ''; return; }
    if (!document.getElementById('house-css')) { var st = document.createElement('style'); st.id = 'house-css'; st.textContent = CSS; document.head.appendChild(st); }
    host.hidden = false; host.className = 'hsec'; host.setAttribute('data-hid', P);
    cart = cart.filter(function (c) { return room(c.id) && room(c.id).free; });
    draw();
  }

  function keep() {
    HOUSE.rooms.forEach(function (r) {
      for (var i = 0; i < 3; i++) ['n', 't', 'a'].forEach(function (p) { var e = $('h' + p + '_' + r.id + '_' + i); if (e) saved[p + '_' + r.id + '_' + i] = e.value; });
    });
  }
  function restore() {
    Object.keys(saved).forEach(function (k) { var e = $('h' + k.charAt(0) + k.slice(1)); if (e && saved[k] !== '') e.value = saved[k]; });
    HOUSE.rooms.forEach(function (r) { for (var i = 0; i < 3; i++) kidToggle(r.id, i); });
  }
  function kidToggle(id, i) { var t = $('ht_' + id + '_' + i), a = $('ha_' + id + '_' + i); if (!t || !a) return; a.disabled = t.value !== 'child'; if (a.disabled) a.value = ''; }

  function dateBar() {
    var d = HOUSE.dates; if (!d || !d.open || INFO.datesOpen) return '';
    var today = new Date().toISOString().slice(0, 10);
    return '<div class="hdates"><div class="row2"><label>Check-in<input type="date" id="' + P + 'hCi" min="' + today + '" value="' + esc(d.checkIn) + '"></label><label>Check-out<input type="date" id="' + P + 'hCo" min="' + today + '" value="' + esc(d.checkOut) + '"></label>' +
      '<div class="hdn"><b>' + d.nights + ' night' + (d.nights > 1 ? 's' : '') + '</b><span>' + (d.custom ? 'Your dates differ from the retreat (' + esc(d.retreatStart) + ' to ' + esc(d.retreatEnd) + ').' : 'The retreat dates. Change them to add nights before or after.') + '</span></div></div>' +
      '<p class="hhint">Choose your own dates. Extra nights outside the retreat include all meals.</p><div class="herr" id="' + P + 'hDateErr"></div></div>';
  }
  function draw() {
    var html = '<div class="section-heading" style="grid-template-columns:1fr;gap:12px"><div><p class="kicker">Your private house</p><h2>' + esc(HOUSE.label) + '</h2></div>' +
      (HOUSE.intro ? '<p style="max-width:720px;font-size:15px">' + esc(HOUSE.intro) + '</p>' : '') +
      '<p style="max-width:720px;font-size:14px">Taxes and fees and staff gratuity are added at checkout, and your full total is shown before you pay.</p>' +
      dateBar() + '</div>' +
      gallery() +
      '<div class="hgrid"><div>' + HOUSE.rooms.map(roomCard).join('') + '</div><aside class="hcart" id="' + P + 'hcart"></aside></div>';
    $p('house').innerHTML = html;
    restore();
    drawCart();
  }

  function gallery() {
    var g = HOUSE.gallery || [];
    if (!g.length) return '';
    return '<div class="hgal"><img class="himg hgalmain" id="' + P + 'hgalmain" alt="' + esc(HOUSE.label) + '" src="' + esc(g[0]) + '"><div class="hthumbs hgalthumbs">' +
      g.map(function (u, i) { return '<button type="button" class="hthumb' + (i ? '' : ' on') + '" data-room="gal" data-src="' + esc(u) + '" aria-label="Photo ' + (i + 1) + '"><img loading="lazy" alt="" src="' + esc(u) + '"></button>'; }).join('') + '</div></div>';
  }

  function roomCard(r) {
    var inCart = cart.some(function (c) { return c.id === r.id; });
    var opts = r.options.map(function (o) { return o.n; });
    var n = pick[r.id] && opts.indexOf(pick[r.id]) >= 0 ? pick[r.id] : opts[0];
    var o = opt(r, n);
    var imgs = r.images || [];
    var left = imgs.length ? '<img class="himg" id="hmain_' + r.id + '" alt="' + esc(r.label) + '" src="' + esc(imgs[0]) + '">' +
      (imgs.length > 1 ? '<div class="hthumbs">' + imgs.map(function (u, i) { return '<button type="button" class="hthumb' + (i ? '' : ' on') + '" data-room="' + r.id + '" data-src="' + esc(u) + '" aria-label="Photo ' + (i + 1) + '"><img loading="lazy" alt="" src="' + esc(u) + '"></button>'; }).join('') + '</div>' : '')
      : '<div class="hph">Photo coming soon</div>';
    var occ = opts.length > 1 || r.kind === 'twin' ? '<div class="hocc">' + opts.map(function (k) { return '<button type="button" data-occ="' + r.id + '" data-n="' + k + '" class="' + (k === n ? 'on' : '') + '">' + occLabel(r, k) + '</button>'; }).join('') + '</div>' : '';
    var guests = '';
    for (var i = 0; i < n; i++) guests += '<div class="hg"><input id="hn_' + r.id + '_' + i + '" placeholder="Guest ' + (i + 1) + ' full name" autocomplete="off"><select id="ht_' + r.id + '_' + i + '" data-kid="' + r.id + '" data-i="' + i + '"><option value="adult">Adult</option><option value="child">Child</option></select><input id="ha_' + r.id + '_' + i + '" type="number" min="0" max="17" placeholder="Age" disabled></div>';
    var sold = !r.free ? '<p class="hsold">' + (HOUSE.open ? 'Not available' : 'Not available for these dates') + '</p>' : '';
    return '<div class="hroom" id="hroom_' + r.id + '"><div>' + left + '</div><div><h3>' + esc(r.label) + '</h3><div class="hmeta">' + esc(r.beds) + ' · sleeps up to ' + r.max + '</div>' +
      (r.desc ? '<p style="margin:0 0 8px;font-size:14px">' + esc(r.desc) + '</p>' : '') +
      (r.note ? '<div class="hnote">' + esc(r.note) + '</div>' : '') +
      '<div class="hmeta">' + rateLine(r) + '</div>' + sold +
      (r.free ? occ + '<div>' + guests + '<div class="herr" id="herr_' + r.id + '"></div></div>' +
        '<div class="hprice"><span>' + n + ' guest' + (n > 1 ? 's' : '') + ' · ' + o.nights + ' night' + (o.nights > 1 ? 's' : '') + ', before taxes and fees</span><b>' + money(o.roomSubtotal + o.teaching) + '</b></div>' +
        '<button class="hadd" type="button" data-add="' + r.id + '"' + (inCart ? ' disabled' : '') + '>' + (inCart ? 'Added to your reservation' : 'Add this room') + '</button>' : '') +
      '</div></div>';
  }

  function addRoom(id) {
    var r = room(id), n = pick[id] && r.options.some(function (o) { return o.n === pick[id]; }) ? pick[id] : r.options[0].n, g = [], err = '', adults = 0;
    for (var i = 0; i < n; i++) {
      var nm = $('hn_' + id + '_' + i).value.trim(), t = $('ht_' + id + '_' + i).value, a = $('ha_' + id + '_' + i).value;
      if (nm.split(/\s+/).filter(Boolean).length < 2) err = 'Please enter the full name (first and last) of every guest.';
      if (t === 'child' && (a === '' || +a < 0 || +a > 17)) err = err || 'Please enter the age of each child.';
      if (t === 'adult') adults++;
      g.push({ name: nm, type: t, age: t === 'child' ? +a : null });
    }
    if (!adults) err = err || 'Each room needs at least one adult.';
    $('herr_' + id).textContent = err;
    if (err) return;
    cart.push({ id: id, n: n, guests: g }); keep(); draw();
  }
  function drop(id) { cart = cart.filter(function (c) { return c.id !== id; }); keep(); draw(); }

  function total() { return Math.round(cart.reduce(function (s, c) { return s + opt(room(c.id), c.n).total; }, 0) * 100) / 100; }
  function subtotal() { return Math.round(cart.reduce(function (s, c) { var o = opt(room(c.id), c.n); return s + o.roomSubtotal + o.teaching; }, 0) * 100) / 100; }
  function guestCount() { return cart.reduce(function (s, c) { return s + c.n; }, 0); }
  function lineDetail(c) {
    var r = room(c.id), o = opt(r, c.n), rows = '';
    var rateTxt = o.rateLabel === 'private' ? money(o.nightlyRate) + ' per night' : money(o.nightlyRate) + ' per person, per night';
    rows += '<div class="row"><span>' + (o.rateLabel === 'private' ? '1 guest' : (o.rateLabel === 'sharing' ? '2 guests' : '2 guests sharing') ) + ' × ' + rateTxt + ' × ' + o.nights + ' nights</span><span>' + money(o.nightlyRate * o.nights * (o.rateLabel === 'private' ? 1 : 2)) + '</span></div>';
    if (o.supplement) rows += '<div class="row"><span>Individual bed · ' + money(o.supplement.nightlyRate) + ' × ' + o.nights + ' nights</span><span>' + money(o.supplement.amount) + '</span></div>';
    rows += '<div class="row"><span>Room subtotal</span><span>' + money(o.roomSubtotal) + '</span></div>';
    if (o.teaching) rows += '<div class="row"><span>Teaching fee</span><span>' + money(o.teaching) + '</span></div>';
    return rows;
  }
  function drawCart() {
    var box = $p('hcart'); if (!box) return;
    if (!cart.length) { box.innerHTML = '<h4>Your reservation</h4><p style="color:#7a705c;font-size:13.5px;margin:0">No rooms yet. Choose a room to start.</p>'; return; }
    var h = '<h4>Your reservation</h4>' + cart.map(function (c) {
      var r = room(c.id), o = opt(r, c.n);
      return '<div class="hcl"><div class="t"><span>' + esc(r.label) + '<small>' + esc(r.beds) + '</small></span><span>' + money(o.roomSubtotal + o.teaching) + '</span></div><small>' +
        c.guests.map(function (g) { return esc(g.name) + (g.type === 'child' ? ' (child, ' + g.age + ')' : ''); }).join(', ') + '</small>' + lineDetail(c) +
        '<button type="button" data-drop="' + c.id + '">Remove</button></div>';
    }).join('') + '<div class="htot"><span>Subtotal · ' + guestCount() + ' guest' + (guestCount() > 1 ? 's' : '') + ' · ' + cart.length + ' room' + (cart.length > 1 ? 's' : '') + '</span><span>' + money(subtotal()) + '</span></div><p style="font-size:12.5px;color:#5b5a50;margin:8px 0 0">Taxes and fees and staff gratuity are added at checkout, and your full total is shown before you pay.</p>' +
      (INFO.preview ? '<p style="font-size:12.5px;color:#7a705c;margin:10px 0 0">Preview only: payment is turned off on this page.</p>'
        : (HOUSE.wholeHouseOnly&&cart.length<HOUSE.rooms.length
            ? '<button class="hadd" style="margin-top:12px" type="button" disabled>Add all '+HOUSE.rooms.length+' rooms to continue ('+cart.length+' of '+HOUSE.rooms.length+' added)</button><p style="font-size:12.5px;color:#7a705c;margin:8px 0 0">' + esc(HOUSE.label) + ' is booked as a whole house.</p>'
            : '<button class="hadd" style="margin-top:12px" type="button" data-checkout="1">Continue to payment</button>'));
    box.innerHTML = h;
  }

  // ---- checkout ----
  function modal() {
    var m = $p('hbg');
    if (!m) { m = document.createElement('div'); m.id = P + 'hbg'; m.className = 'hbgm'; m.setAttribute('data-hid', P); m.innerHTML = '<div class="hmodal"><button class="hx" type="button" aria-label="Close" data-hclose="1">&times;</button><div id="' + P + 'hbody"></div></div>'; document.body.appendChild(m); }
    return m;
  }
  function openCheckout() {
    if (HOUSE.wholeHouseOnly && cart.length < HOUSE.rooms.length) return;
    var dep = INFO.deposit && INFO.deposit.on && INFO.deposit.eligible ? INFO.deposit : null;
    var t = total();
    var sum = cart.map(function (c) { var r = room(c.id), o = opt(r, c.n); return '<div class="hline"><span>' + esc(r.label) + ' · ' + c.n + ' guest' + (c.n > 1 ? 's' : '') + '</span><span>' + money(o.roomSubtotal + o.teaching) + '</span></div>'; }).join('');
    var tx = cart.reduce(function (a, c) { var o = opt(room(c.id), c.n); return { t: a.t + o.taxes, g: a.g + o.gratuity }; }, { t: 0, g: 0 });
    var dts = HOUSE.dates ? HOUSE.dates.checkIn + ' to ' + HOUSE.dates.checkOut + ' (' + HOUSE.dates.nights + ' nights)' : '';
    $p('hbody').innerHTML = '<h3 style="font-family:var(--display);font-weight:400;font-size:28px;margin:0 0 8px">Checkout</h3>' + (dts ? '<p style="margin:0 0 8px;font-size:13.5px"><b>Your dates:</b> ' + esc(dts) + '</p>' : '') + sum +
      '<div class="hline" style="border-top:1px solid var(--line);margin-top:6px;padding-top:6px"><span>Subtotal</span><span>' + money(subtotal()) + '</span></div>' +
      '<div class="hline"><span>Taxes and fees (' + INFO.taxFeePct + '%)</span><span>' + money(tx.t) + '</span></div>' +
      '<div class="hline"><span>Staff gratuity ($' + INFO.gratuityPerNight + ' per guest, per night)</span><span>' + money(tx.g) + '</span></div>' +
      '<div class="hline" style="font-weight:700;border-top:2px solid var(--ink);margin-top:6px;padding-top:6px;font-size:16px"><span>Your full total</span><span>' + money(t) + '</span></div>' +
      '<label>Your full name<input type="text" id="' + P + 'hbName" autocomplete="name" placeholder="First and last name"></label>' +
      '<label>Email<input type="email" id="' + P + 'hbEmail" autocomplete="email" placeholder="you@example.com"></label>' +
      '<label>Phone number<input type="tel" id="' + P + 'hbPhone" autocomplete="tel" placeholder="+1 555 123 4567"></label>' +
      (dep ? '<div style="margin-top:12px;font-size:13.5px"><label style="display:flex;gap:8px;align-items:flex-start"><input type="radio" name="' + P + 'hplan" value="full" checked> <span>Pay the full amount today, ' + money(t) + '</span></label>' +
        '<label style="display:flex;gap:8px;align-items:flex-start"><input type="radio" name="' + P + 'hplan" value="deposit"> <span>Pay ' + dep.pct + '% today and the rest on ' + esc(dep.balanceDate) + ', charged automatically to the same card</span></label>' +
        '<label id="' + P + 'hbAuthWrap" style="display:none;gap:8px;align-items:flex-start"><input type="checkbox" id="' + P + 'hbAuth"> <span>I authorize Amansala to charge the remaining balance to this card on ' + esc(dep.balanceDate) + '.</span></label></div>' : '') +
      '<div style="margin-top:12px;font-size:12.5px;background:#fff;border:1px solid var(--line);padding:10px;max-height:120px;overflow:auto;white-space:pre-line">' + esc(INFO.policy) + '</div>' +
      '<label style="display:flex;gap:8px;align-items:flex-start"><input type="checkbox" id="' + P + 'hbCancel"> <span>I have read and agree to the cancellation policy.</span></label>' +
      '<div class="herr" id="' + P + 'hbErr"></div><button class="hadd" style="margin-top:12px" type="button" id="' + P + 'hbGo" data-hgo="1">Continue to payment</button>';
    modal().classList.add('open');
  }
  function goPay() {
    var plan = (document.querySelector('input[name="' + P + 'hplan"]:checked') || {}).value === 'deposit' ? 'deposit' : 'full';
    var body = {
      bookingId: bookingId, houseId: opts.houseId || null, plan: plan, dates: HOUSE.dates && HOUSE.dates.open ? { checkIn: HOUSE.dates.checkIn, checkOut: HOUSE.dates.checkOut } : null,
      rooms: cart.map(function (c) { return { id: c.id, guests: c.guests }; }),
      booker: { name: $p('hbName').value.trim(), email: $p('hbEmail').value.trim(), phone: $p('hbPhone').value.trim() },
      acks: { cancellation: $p('hbCancel').checked, balanceAuth: !!($p('hbAuth') && $p('hbAuth').checked) }
    };
    $p('hbGo').disabled = true; $p('hbErr').textContent = '';
    fetch('/.netlify/functions/retreat-booking-house-intent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j, s: r.status }; }); })
      .then(function (x) {
        if (!x.ok) { $p('hbErr').textContent = (x.j && x.j.error) || 'Could not start the payment.'; $p('hbGo').disabled = false; if (x.s === 409) refresh(); return; }
        stripe = Stripe(x.j.publishableKey);
        elements = stripe.elements({ clientSecret: x.j.clientSecret, appearance: { theme: 'stripe', variables: { fontFamily: 'DM Sans, sans-serif', borderRadius: '0px', colorPrimary: '#3f5147' } } });
        $p('hbody').innerHTML = '<h3 style="font-family:var(--display);font-weight:400;font-size:28px;margin:0 0 8px">Payment</h3><p style="font-size:14px">Paying today: <b>' + money(x.j.amount) + '</b>' +
          (x.j.plan === 'deposit' ? ' · remaining ' + money(x.j.balance) + ' on ' + esc(x.j.balanceDate) : '') + '</p><div id="' + P + 'hbStripe"></div><div class="herr" id="' + P + 'hbErr"></div><button class="hadd" style="margin-top:12px" type="button" id="' + P + 'hbPay" data-hpay="1">Pay ' + money(x.j.amount) + '</button>';
        elements.create('payment').mount('#' + P + 'hbStripe');
        doneInfo = { amount: x.j.amount, record: x.j.recordUrl, balance: x.j.plan === 'deposit' ? { amt: x.j.balance, date: x.j.balanceDate } : null };
      }).catch(function () { $p('hbErr').textContent = 'Connection problem. Please try again.'; $p('hbGo').disabled = false; });
  }
  function pay() {
    $p('hbPay').disabled = true; $p('hbErr').textContent = '';
    stripe.confirmPayment({ elements: elements, confirmParams: { return_url: location.href }, redirect: 'if_required' }).then(function (res) {
      if (res.error) { $p('hbErr').textContent = res.error.message || 'Payment failed.'; $p('hbPay').disabled = false; return; }
      var d = doneInfo || {};
      $p('hbody').innerHTML = '<h3 style="font-family:var(--display);font-weight:400;font-size:28px;margin:0 0 8px">Thank you</h3><p>Your payment of <b>' + money(d.amount) + '</b> was received and your ' + esc(HOUSE.label) + ' rooms are reserved. A confirmation with every room, guest and price was sent to your email.</p>' +
        (d.balance ? '<p>The remaining <b>' + money(d.balance.amt) + '</b> will be charged to the same card on <b>' + esc(d.balance.date) + '</b>.</p>' : '') +
        (d.record ? '<p><a href="' + esc(d.record) + '" target="_blank" rel="noopener">Download your booking record (PDF)</a></p>' : '');
      cart = []; draw();
    });
  }
  function refresh(ci, co) {
    var q = (ci && co ? '&ci=' + encodeURIComponent(ci) + '&co=' + encodeURIComponent(co) : '');
    return fetch('/.netlify/functions/retreat-booking-info?r=' + encodeURIComponent(bookingId) + (INFO.preview ? '&preview=1' : '') + q).then(function (r) { return r.json(); }).then(function (j) { if (j && j.rooms) { INFO.nights = j.nights; if (window.rbHouse) window.rbHouse.init(j); else init(j); } });
  }
  function dateChange() {
    var ci = $p('hCi').value, co = $p('hCo').value, err = $p('hDateErr');
    if (!ci || !co) return;
    if (co <= ci) { err.textContent = 'Check-out must be after check-in.'; return; }
    err.textContent = '';
    keep(); refresh(ci, co).then(function () { var e = $p('hDateErr'); if (e && HOUSE.dates && (HOUSE.dates.checkIn !== ci || HOUSE.dates.checkOut !== co)) e.textContent = 'Those dates are not available. Showing the retreat dates.'; });
  }

  document.addEventListener('click', function (e) {
    var t = e.target; if (!t || !t.closest) return;
    if (!t.closest('[data-hid="' + P + '"]')) return;   // only this house's own section / checkout window
    var b;
    if ((b = t.closest('.hthumb'))) { var m = $(b.dataset.room === 'gal' ? 'hgalmain' : 'hmain_' + b.dataset.room); if (m) { m.src = b.dataset.src; $p('house').querySelectorAll('.hthumb[data-room="' + b.dataset.room + '"]').forEach(function (x) { x.classList.toggle('on', x === b); }); } return; }
    if ((b = t.closest('[data-occ]'))) { keep(); pick[b.dataset.occ] = +b.dataset.n; draw(); return; }
    if ((b = t.closest('[data-add]'))) { addRoom(b.dataset.add); return; }
    if ((b = t.closest('[data-drop]'))) { drop(b.dataset.drop); return; }
    if (t.closest('[data-checkout]')) { openCheckout(); return; }
    if (t.closest('[data-hclose]')) { modal().classList.remove('open'); return; }
    if (t.closest('[data-hgo]')) { goPay(); return; }
    if (t.closest('[data-hpay]')) { pay(); return; }
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (!t || !t.closest || !t.closest('[data-hid="' + P + '"]')) return;
    if (t && (t.id === P + 'hCi' || t.id === P + 'hCo')) { dateChange(); return; }
    if (t && t.dataset && t.dataset.kid) kidToggle(t.dataset.kid, t.dataset.i);
    if (t && t.name === P + 'hplan') { var w = $p('hbAuthWrap'); if (w) w.style.display = t.value === 'deposit' ? 'flex' : 'none'; }
  });

    return { init: init };
  }
  var houses = [
    create({ P: '', houseId: null, pick: function (i) { return i.house; } }),
    create({ P: 'c4_', houseId: 'casita4', pick: function (i) { return (i.houses || []).filter(function (h) { return h.id === 'casita4'; })[0]; } })
  ];
  window.rbHouse = { init: function (info) { houses.forEach(function (h) { h.init(info); }); } };
})();
