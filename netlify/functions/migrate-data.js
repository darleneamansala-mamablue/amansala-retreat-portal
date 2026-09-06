const OLD_URL = 'https://fzresosiqafiyxfgeyvk.supabase.co';
const OLD_KEY = 'sb_publishable_SG-1dCQntmSYtb1zwgl7Vg_-nAlTrsB';
const NEW_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const secret = process.env.MIGRATION_SECRET;
  if (secret && (event.headers['x-migration-secret'] || '') !== secret) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const newKey = process.env.SUPABASE_SERVICE_KEY_NEW;
  if (!newKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing SUPABASE_SERVICE_KEY_NEW' }) };
  }

  const oldHdrs = { 'apikey': OLD_KEY, 'Authorization': `Bearer ${OLD_KEY}` };
  const newHdrs = {
    'apikey': newKey, 'Authorization': `Bearer ${newKey}`,
    'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates',
  };

  const getKey = async (key) => {
    const r = await fetch(`${OLD_URL}/rest/v1/app_store?key=eq.${key}&select=value`, { headers: oldHdrs });
    if (!r.ok) throw new Error(`app_store read failed for key=${key}: ${r.status}`);
    const d = await r.json();
    return d[0]?.value ?? [];
  };

  const upsert = async (table, rows) => {
    if (!rows.length) return { count: 0, status: 'empty' };
    const w = await fetch(`${NEW_URL}/rest/v1/${table}`, {
      method: 'POST', headers: newHdrs, body: JSON.stringify(rows),
    });
    if (!w.ok) return { error: `${w.status}: ${await w.text()}` };
    return { count: rows.length, status: 'ok' };
  };

  const results = {};

  try {
    // room_types already complete in new Supabase — skip

    // ── BOOKINGS ──────────────────────────────────────────────
    const rawBks = await getKey('bookings');
    // Skip bookings with no dates (incomplete/test data)
    const validBks = rawBks.filter(bk => bk.startDate && bk.endDate);
    console.log(`[migrate] bookings total=${rawBks.length} valid=${validBks.length}`);
    const validBkIds = new Set(validBks.map(b => b.id));
    const bkRows = validBks.map(bk => ({
      id:                       bk.id,
      leader_name:              bk.leaderName              || '(sin nombre)',
      leader_email:             bk.leaderEmail             || null,
      leader_phone:             bk.leaderPhone             || null,
      retreat_name:             bk.retreatName             || null,
      start_date:               bk.startDate               || null,
      end_date:                 bk.endDate                 || null,
      venue_row:                bk.row                     || null,
      pax:                      bk.pax                     ?? 0,
      status:                   bk.status                  || 'pending',
      notes:                    bk.notes                   || null,
      doc_link:                 bk.docLink                 || null,
      blocked_rooms:            bk.blockedRooms            ?? [],
      packages:                 bk.packages                ?? [],
      schedule_request:         bk.scheduleRequest         ?? null,
      deposit_invoice:          bk.depositInvoice          || null,
      contract_sent_at:         bk.contractSentAt          || null,
      contract_sent_via_portal: bk.contractSentViaPortal   ?? false,
      contract_signed_at:       bk.contractSignedAt        || null,
      contract_signature:       bk.contractSignature       || null,
      add_ons_confirmed_at:     bk.addOnsConfirmedAt       || null,
      status_changed_at:        bk.statusChangedAt         || null,
      cb_allotment_block_code:  bk.cbAllotmentBlockCode    || null,
      cb_reservation_ids:       bk.cbReservationIds        ?? {},
      cb_guest_ids:             bk.cbGuestIds              ?? {},
      cb_adjustment_ids:        bk.cbAdjustmentIds         ?? {},
      cb_note_ids:              bk.cbNoteIds               ?? {},
      all_locked:               bk.allLocked               ?? false,
      created_at:               bk.submittedAt             || new Date().toISOString(),
    }));
    results.bookings = await upsert('bookings', bkRows);

    // ── PAYMENTS (extracted from bookings) ────────────────────
    const payRows = [];
    validBks.forEach(bk => {
      (bk.payments || []).forEach(p => {
        payRows.push({
          id:         p.id,
          booking_id: bk.id,
          amount:     p.amount   ?? 0,
          method:     p.method   || null,
          date:       p.date     || null,
          note:       p.note     || null,
          ref:        p.ref      || null,
          created_at: p.ts       || new Date().toISOString(),
        });
      });
    });
    results.payments = await upsert('payments', payRows);

    // ── REGISTRATIONS ─────────────────────────────────────────
    const rawRegs = await getKey('regs');
    // Only migrate regs whose booking was successfully migrated
    const regRows = rawRegs.filter(r => validBkIds.has(r.bookingId)).map(reg => ({
      id:           reg.id,
      booking_id:   reg.bookingId   || null,
      room:         reg.room        || null,
      notes:        reg.notes       || null,
      guests:       reg.guests      ?? [],
      amount_paid:  reg.amountPaid  ?? null,
      room_type_id: reg.roomTypeId  || null,
      custom_price: reg.customPrice ?? null,
    }));
    results.registrations = await upsert('registrations', regRows);

    const allOk = Object.values(results).every(r => !r.error);
    console.log('[migrate-data]', JSON.stringify(results));
    return { statusCode: allOk ? 200 : 207, body: JSON.stringify({ ok: allOk, results }) };

  } catch (err) {
    console.error('[migrate-data] Exception:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
