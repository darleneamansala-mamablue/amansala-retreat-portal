'use strict';

// spa-payroll-data.js — the data spa-payroll.html adds up, for admins only (staff-login pass, role admin), 2026-11-02.
// The page used to read the whole spa catalog and every appointment (clients' names, emails, phones) with the public key,
// and its sign-in could be skipped by putting anything in sessionStorage. Now: services (name, price, length), therapists
// with their pay rates, and appointments with only what payroll counts (who, which service, when, status).
const { staffAllowed } = require('./portal-auth-lib');

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const reply = (code, data) => ({ statusCode: code, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, X-Portal-Token', 'Content-Type': 'application/json' }, body: JSON.stringify(data) });

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return reply(200, {});
  if (!await staffAllowed(event, { admin: true })) return reply(401, { error: 'Sign in again' });
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return reply(500, { error: 'Server config error' });
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=in.(spa_data,spa_appointments)&select=key,value`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    const rows = r.ok ? await r.json() : [];
    const sd = (rows.find(x => x.key === 'spa_data') || {}).value || {}, ap = (rows.find(x => x.key === 'spa_appointments') || {}).value || [];
    return reply(200, {
      services: (sd.services || []).map(s => ({ id: s.id, name: s.name, price: s.price, duration: s.duration })),
      therapists: (sd.therapists || []).map(t => ({ id: t.id, firstName: t.firstName, lastName: t.lastName,
        services: (t.services || []).map(x => ({ serviceId: x.serviceId, compensationType: x.compensationType, compensationValue: x.compensationValue, compensationCurrency: x.compensationCurrency })) })),
      appointments: (Array.isArray(ap) ? ap : []).map(a => ({ therapistId: a.therapistId, serviceId: a.serviceId, status: a.status, date: a.date, start: a.start, duration: a.duration, confirmed: a.confirmed, confirmedByRole: a.confirmedByRole })),
    });
  } catch (e) {
    console.error('[spa-payroll-data]', e);
    return reply(500, { error: 'Could not load payroll' });
  }
};
