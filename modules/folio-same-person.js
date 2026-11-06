// ===== folio-same-person.js — one folio per guest even when their name is written another way (Jorge 2026-11-06) =====
// "Leanne McCoy", "Patricia Leanne Harrell McCoy" and "Leanne Harrell-McCoy" became three folios of one guest in Shanti 6b:
// the shared find-or-create (folioFindOrCreate, booking-hub.html) matches the exact name only. Before it runs, the name is
// swapped for the guest_name of the folio this person already has in that room -- same rule as netlify/functions/folio-lib.js
// (one name's words all inside the other's, or same first and last word; in a one-guest room every folio not filed under
// another guest is theirs; open folios first, the name on the room list first, then the oldest). Classic script, loaded
// after booking-hub.html's inline script; wraps the global.
(function () {
  if (typeof folioFindOrCreate !== 'function') return;
  const words = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  const samePerson = (a, b) => {
    const A = words(a), B = words(b);
    if (!A.length || !B.length) return false;
    if (A.join(' ') === B.join(' ')) return true;
    const [small, big] = A.length <= B.length ? [A, B] : [B, A];
    if (small.length >= 2 && small.every(w => big.includes(w))) return true;
    return A.length >= 2 && B.length >= 2 && A[0] === B[0] && A[A.length - 1] === B[B.length - 1];
  };
  window.folioSamePerson = samePerson;
  const orig = folioFindOrCreate;
  folioFindOrCreate = async function (o = {}) {
    try {
      if (o.registrationId && o.guestName) {
        const { data: folios } = await db.from('folios').select('guest_name,status,created_at').eq('registration_id', o.registrationId);
        const same = (folios || []).some(f => words(f.guest_name).join(' ') === words(o.guestName).join(' ') && (!o.openOnly || f.status === 'open'));
        if (!same && folios && folios.length) {
          const reg = (AppData.regs || []).find(r => r.id === o.registrationId);
          const guests = ((reg && reg.guests) || []).filter(g => g && g.name && !g.cancelled).map(g => g.name);
          const others = guests.filter(g => !samePerson(g, o.guestName));
          const mine = folios.filter(f => samePerson(f.guest_name, o.guestName) || (guests.length <= 1 && !others.some(x => samePerson(x, f.guest_name))));
          const onList = f => guests.some(g => words(g).join(' ') === words(f.guest_name).join(' ')) ? 0 : 1;
          const pick = mine.filter(f => f.status === 'open').sort((x, y) => onList(x) - onList(y) || String(x.created_at).localeCompare(String(y.created_at)))[0] || (o.openOnly ? null : mine[0]);
          if (pick) o = { ...o, guestName: pick.guest_name };
        }
      }
    } catch (e) {}
    return orig(o);
  };
})();
