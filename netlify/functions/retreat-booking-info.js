'use strict';
// Public data for the Retreat Booking page: retreat name/dates, banner, room options with all-in prices and how many are still
// free, spa services, cancellation policy. Never returns guest names or emails. Prices come from rb-lib.priceCart (single source).
const L = require('./rb-lib');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: L.cors(), body: '' };
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return L.json(500, { error: 'Server config error' });
  const id = (event.queryStringParameters && event.queryStringParameters.r) || '';
  if (!id) return L.json(400, { error: 'Missing retreat' });
  try {
    const found = await L.loadRetreat(key, id);
    if (!found || !found.cfg || !found.cfg.enabled) return L.json(404, { notOpen: true, error: 'This booking page is not open yet.' });
    const { bk, cfg } = found;
    if (bk.status === 'cancelled') return L.json(404, { notOpen: true, error: 'This booking page is not open.' });
    const nights = L.nightsOf(bk);
    const av = await L.availability(key, bk, cfg);
    const rooms = (cfg.rooms || []).map((rm) => {
      const freeList = (av[rm.rtId] || { free: [] }).free;
      const free = freeList.length;
      const freeChica = freeList.filter(L.isChica).length;      // for guests who tick "I am a leader"
      const base = { rtId: rm.rtId, kind: rm.kind, label: rm.label, desc: rm.desc || '', imageUrl: rm.imageUrl || '', tags: rm.tags || [], free, freeChica };
      if (rm.kind === 'king') {
        const share = L.priceCart(cfg, nights, { room: { rtId: rm.rtId, mode: 'share' } });
        const solo = L.priceCart(cfg, nights, { room: { rtId: rm.rtId, mode: 'solo' } });
        return { ...base, sharePerPerson: share.lines[0].perPerson, soloPerPerson: solo.lines[0].perPerson };
      }
      if (rm.kind === 'twin') {
        const p = L.priceCart(cfg, nights, { room: { rtId: rm.rtId, mode: 'beds', beds: 1 } });
        return { ...base, maxBeds: Number(rm.maxBeds) || 2, perBed: p.lines[0].perPerson };
      }
      const p = L.priceCart(cfg, nights, { room: { rtId: rm.rtId, mode: 'solo' } });
      return { ...base, soloPerPerson: p.lines[0].perPerson };
    });
    return L.json(200, {
      bookingId: bk.id,
      title: cfg.title || bk.retreat_name || bk.leader_name,
      startDate: bk.start_date,
      endDate: bk.end_date,
      nights,
      bannerUrl: cfg.bannerUrl || '',
      intro: cfg.intro || '',
      teachingFeeOn: !!(cfg.teachingFee && cfg.teachingFee.on),
      gratuityPerNight: Number(cfg.gratuityPerNight) || 0,
      includes: cfg.includes || [],
      notIncluded: cfg.notIncluded || '',
      policy: cfg.policy || L.DEFAULT_POLICY,
      rooms,
      services: cfg.services || [],
    });
  } catch (e) {
    console.error('[retreat-booking-info]', e.message);
    return L.json(500, { error: 'Could not load this retreat' });
  }
};
