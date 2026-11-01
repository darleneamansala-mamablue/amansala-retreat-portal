// node test/folio-lib.test.js -- netlify/functions/folio-lib.js: uses find_or_create_folio when installed, and returns null
// (caller keeps its old look-up) when it is not, without asking again on every call.
const assert = require('assert');
let calls = [], reply;
global.fetch = async (url, opts) => { calls.push({ url, body: JSON.parse(opts.body) }); return reply(); };
const fresh = () => { delete require.cache[require.resolve('../netlify/functions/folio-lib')]; return require('../netlify/functions/folio-lib').findOrCreateFolioLocked; };
(async () => {
  let f = fresh();
  reply = () => ({ ok: true, status: 200, json: async () => ({ folio: { id: 'F1' }, created: true }) });
  const r = await f('KEY', { registrationId: 'reg1', guestName: 'Ana', reuseAnyOpen: true });
  assert.deepStrictEqual([r.id, r.created], ['F1', true]);
  assert.ok(calls[0].url.endsWith('/rest/v1/rpc/find_or_create_folio'));
  assert.strictEqual(calls[0].body.p_registration_id, 'reg1'); assert.strictEqual(calls[0].body.p_reuse_any_open, true);
  f = fresh(); calls = [];
  reply = () => ({ ok: false, status: 404, json: async () => ({ code: 'PGRST202' }) });
  assert.strictEqual(await f('KEY', { registrationId: 'reg1', guestName: 'Ana' }), null);
  assert.strictEqual(await f('KEY', { registrationId: 'reg1', guestName: 'Ana' }), null);
  assert.strictEqual(calls.length, 1, 'not installed: asked once, then fallback only');
  f = fresh(); calls = [];
  reply = () => { throw new Error('network'); };
  assert.strictEqual(await f('KEY', { registrationId: 'reg1' }), null, 'network error -> fallback');
  assert.strictEqual(await f('KEY', {}), null, 'no subject -> fallback');
  console.log('folio-lib: all passed');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
