// node test/cb-dup-scan.test.js -- copies in Cloudbeds: the same guest with the same dates twice is a candidate; group
// holds, different dates, cancelled rows and a single reservation are not.
const assert = require('assert');
const { candidates } = require('../netlify/functions/cb-dup-scan');
const rows = [
  { id: '1', guest: 'Tiffany Anderson Angela Wagner', start: '2027-01-28', end: '2027-02-02', status: 'confirmed' },
  { id: '2', guest: 'Tiffany  Anderson Angela Wagner', start: '2027-01-28', end: '2027-02-02', status: 'confirmed' },
  { id: '3', guest: 'Angela Wagner Group', start: '2027-01-28', end: '2027-02-02', status: 'confirmed' },
  { id: '4', guest: 'Angela Wagner Group', start: '2027-01-28', end: '2027-02-02', status: 'confirmed' },
  { id: '5', guest: 'Peri Perkins Angela Wagner', start: '2027-01-28', end: '2027-02-02', status: 'confirmed' },
  { id: '6', guest: 'Melany Wynia', start: '2026-11-10', end: '2026-11-11', status: 'confirmed' },
  { id: '7', guest: 'Melany Wynia', start: '2026-11-11', end: '2026-11-15', status: 'confirmed' },
  { id: '8', guest: 'Sheila Story Todd Zinda', start: '2027-01-25', end: '2027-01-31', status: 'confirmed' },
  { id: '9', guest: 'Sheila Story Todd Zinda', start: '2027-01-25', end: '2027-01-31', status: 'canceled' },
];
const c = candidates(rows).map(g => g.map(r => r.id).join(','));
assert.deepStrictEqual(c, ['1,2'], JSON.stringify(c));
console.log('cb dup scan: all checks passed');
