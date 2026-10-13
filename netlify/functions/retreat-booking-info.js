'use strict';
// Public data for the Retreat Booking page: retreat name/dates, banner, room options with all-in prices and how many are still
// free, spa services, cancellation policy. Never returns guest names or emails. Prices come from rb-lib.priceCart (single source).
const L = require('./rb-lib');
const H = require('./rb-house-lib');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: L.cors(), body: '' };
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return L.json(500, { error: 'Server config error' });
  const qs = event.queryStringParameters || {};
  const id = qs.r || '';
  const isTemplate = qs.template === '1';
  const isPreview = isTemplate || qs.preview === '1';      // review mode: shows the page, never takes payment
  if (!id && !isTemplate) return L.json(400, { error: 'Missing retreat' });
  try {
    let bk, cfg;
    if (isTemplate) {
      const saved = await L.appStoreGet(key, L.TEMPLATE_KEY);
      cfg = Object.assign({ enabled: true, policy: L.DEFAULT_POLICY }, JSON.parse(JSON.stringify(L.DEFAULT_CFG)), saved || {});
      bk = { id: 'template', leader_name: cfg.title, retreat_name: cfg.title, start_date: '2027-01-01', end_date: '2027-01-05', status: 'template', blocked_rooms: [], cb_reservation_ids: {} };
    } else {
      const found = await L.loadRetreat(key, id);
      if (!found || !found.cfg || (!found.cfg.enabled && !isPreview)) return L.json(404, { notOpen: true, error: 'This booking page is not open yet.' });
      ({ bk, cfg } = found);
      if (bk.status === 'cancelled') return L.json(404, { notOpen: true, error: 'This booking page is not open.' });
    }
    const range = L.stayRange(cfg, bk, qs.ci, qs.co) || L.stayRange(cfg, bk, '', '');
    const nights = range.nights;
    const av = isPreview ? null : await L.applyStayAvailability(key, bk, await L.availability(key, bk, cfg), range);
    const rooms = (cfg.rooms || []).map((rm) => {
      const freeList = isPreview ? [] : (av[rm.rtId] || { free: [] }).free;
      const freeChica = isPreview ? 9 : freeList.filter(L.isChica).length;      // for guests who tick "I am a leader" (placed at Chica)
      const freeGrande = isPreview ? 9 : freeList.filter(L.isGrande).length;    // leader fallback when Chica is out of this room type
      const free = isPreview ? 9 : (L.grandeOnly(rm) ? freeGrande : freeList.length);   // what a regular guest can book (Beachfront: Grande rooms only)
      const base = { rtId: rm.rtId, kind: rm.kind, label: rm.label, desc: rm.desc || '', imageUrl: rm.imageUrl || '', tags: rm.tags || [], free, freeChica, freeGrande };
      const nightly = { rateShare: rm.kind === 'single' ? null : Number(rm.shareRate) || null, rateSolo: rm.kind === 'twin' ? null : Number(rm.soloRate) || null };
      if (rm.kind === 'house') {
        const h = L.priceCart(cfg, nights, { room: { rtId: rm.rtId, mode: 'house' } });
        return { ...base, houseRate: Number(rm.houseRate) || 0, houseGuests: Number(rm.houseGuests) || 0, breakdown: rm.breakdown || [], gallery: rm.gallery || [], houseTotal: h.lines[0].amount, soloPerPerson: h.lines[0].amount };
      }
      if (rm.kind === 'king') {
        const share = L.priceCart(cfg, nights, { room: { rtId: rm.rtId, mode: 'share' } });
        const solo = L.priceCart(cfg, nights, { room: { rtId: rm.rtId, mode: 'solo' } });
        const out = { ...base, ...nightly, sharePerPerson: share.lines[0].perPerson, soloPerPerson: solo.lines[0].perPerson };
        if (Number(rm.extraGuestRate) > 0) {
          const trio = L.priceCart(cfg, nights, { room: { rtId: rm.rtId, mode: 'trio' } });
          Object.assign(out, { rateThird: Number(rm.extraGuestRate), trioTotal: trio.lines[0].amount });
        }
        return out;
      }
      if (rm.kind === 'twin') {
        const p = L.priceCart(cfg, nights, { room: { rtId: rm.rtId, mode: 'beds', beds: 1 } });
        return { ...base, ...nightly, maxBeds: Number(rm.maxBeds) || 2, perBed: p.lines[0].perPerson };
      }
      const p = L.priceCart(cfg, nights, { room: { rtId: rm.rtId, mode: 'solo' } });
      return { ...base, ...nightly, soloPerPerson: p.lines[0].perPerson };
    });
    // Casa Master (house) bedrooms, each priced for every occupancy it allows (rb-house-lib: the one place house prices are calculated)
    let house = null;
    if (cfg.house && cfg.house.on) {
      const hr = H.parseRange(cfg, bk, qs.ci, qs.co) || H.parseRange(cfg, bk, '', '');
      const hav = isPreview ? { open: true, taken: {}, rooms: {} } : await H.houseAvailability(key, bk, cfg, hr);
      house = {
        dates: { checkIn: hr.checkIn, checkOut: hr.checkOut, nights: hr.nights, custom: hr.custom, retreatStart: bk.start_date, retreatEnd: bk.end_date, open: !!cfg.house.openDates }, label: cfg.house.label || 'Casa Master', intro: cfg.house.intro || '', gallery: cfg.house.gallery || [], wholeHouseOnly: !!cfg.house.wholeHouseOnly, open: !!hav.open,
        rooms: (cfg.house.rooms || []).map((r) => ({
          id: r.id, label: r.label, beds: r.beds || '', desc: r.desc || '', images: r.images || [], kind: r.kind, max: H.capacity(r), note: r.note || '',
          soloRate: Number(r.soloRate) || 0, shareRate: Number(r.shareRate) || 0, extraRate: Number(r.extraRate) || 0,
          free: isPreview ? true : !!(hav.open && hav.rooms[r.id] && hav.rooms[r.id].free),
          options: H.occupancyOptions(r).map((n) => ({ n, ...H.priceRoom(cfg, hr.nights, r, n) })),
        })),
      };
    }
    return L.json(200, {
      house,
      deposit: L.depositOffer(bk, cfg),
      preview: isPreview,
      template: isTemplate,
      slug: isTemplate ? '' : String(cfg.slug || ''),
      bookingId: bk.id,
      title: cfg.title || bk.retreat_name || bk.leader_name,
      startDate: range.checkIn,
      endDate: range.checkOut,
      retreatStart: bk.start_date,
      retreatEnd: bk.end_date,
      datesOpen: !!cfg.openDatesRooms,
      datesCustom: range.custom,
      nights,
      bannerUrl: cfg.bannerUrl || '',
      intro: cfg.intro || '',
      teachingFeeOn: !!(cfg.teachingFee && cfg.teachingFee.on),
      teachingPayee: String(cfg.teachingFeePayee || ''),
      datesNote: String(cfg.datesNote || ''),
      roomNote: String(cfg.roomNote || ''),   // optional note under the price when a guest picks a room; replaces the teaching-fee line
      gratuityPerNight: Number(cfg.gratuityPerNight) || 0,
      taxFeePct: Number(cfg.taxFeePct) || 0,
      teachingFeeAmount: (cfg.teachingFee && cfg.teachingFee.on) ? Number(cfg.teachingFee.amountPP) || 0 : 0,
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
