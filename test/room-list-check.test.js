// node test/room-list-check.test.js -- the daily room check finds guests outside the room list, the same guest twice,
// and a room given to two bookings on the same nights; WeTravel guests without a room, cancelled rows, a Cloudbeds copy
// of the same guest and back-to-back stays are not problems.
const assert = require('assert');
const { findProblems, message } = require('../netlify/functions/room-list-check');
const g = (...n) => n.map(name => ({ name }));
const bookings = [
  { id: 'HR', retreat_name: 'Heather Rex', start_date: '2027-02-07', end_date: '2027-02-11', status: 'deposit_paid', blocked_rooms: ['CH7', '10', 'CH5'] },
  { id: 'HF', retreat_name: 'Hannah French', start_date: '2027-02-05', end_date: '2027-02-09', status: 'deposit_paid', blocked_rooms: ['1B'] },
  { id: 'GI', retreat_name: 'Catherine Gignac', start_date: '2027-02-11', end_date: '2027-02-15', status: 'deposit_paid', blocked_rooms: ['CH6'] },
  { id: 'CB', retreat_name: 'Direct/OTA (Cloudbeds)', start_date: '2027-02-07', end_date: '2027-02-11', status: 'confirmed', blocked_rooms: ['CH5'] },
  { id: 'WT', retreat_name: 'We Travel BBC', start_date: '2027-02-07', end_date: '2027-02-11', status: 'confirmed', blocked_rooms: [] },
  { id: 'OLD', retreat_name: 'Past', start_date: '2026-10-01', end_date: '2026-10-05', status: 'confirmed', blocked_rooms: [] },
  { id: 'X', retreat_name: 'Cancelled', start_date: '2027-02-07', end_date: '2027-02-11', status: 'cancelled', blocked_rooms: [] },
];
const regs = [
  { booking_id: 'HR', room: 'CH7', guests: g('Stephanie Cleary') },
  { booking_id: 'HR', room: 'CH7', guests: g('Stephanie Cleary') },
  { booking_id: 'HR', room: '10', guests: g('David Cotterell', 'Heather Rex'), check_in: '2027-02-06' },
  { booking_id: 'HR', room: 'CH6', guests: g('AnnMarie Neely') },
  { booking_id: 'HF', room: '1B', guests: g('Colleen Gottlieb') },
  { booking_id: 'HF', room: '10', guests: g('Colleen Gottlieb') },
  { booking_id: 'GI', room: 'CH6', guests: g('Lisa Kerlik') },
  { booking_id: 'CB', room: 'CH5', guests: g('Heather Rex Heather Rex') },
  { booking_id: 'HR', room: 'CH5', guests: [] },
  { booking_id: 'WT', room: null, guests: g('Nicole McKinnon') },
  { booking_id: 'HR', room: 'GV9', guests: g('Gone'), cancelled: true },
  { booking_id: 'X', room: 'Q', guests: g('Nobody') },
  { booking_id: 'OLD', room: 'Q', guests: g('Old') },
];
const p = findProblems(bookings, regs, '2026-11-03');
const t = p.map(x => x.kind + ': ' + x.text);
console.log(t.join('\n'));
assert.strictEqual(p.filter(x => x.kind === 'clash').length, 1, 'one clash: room 10');
assert.ok(/^clash: 10 6 feb–9 feb: Colleen Gottlieb \(Hannah French\) y David Cotterell \/ Heather Rex \(Heather Rex\)/.test(t[0]), 'clash first, with nights');
assert.ok(t.includes('outside: CH6 fuera de la lista de Heather Rex: AnnMarie Neely'));
assert.ok(t.includes('outside: 10 fuera de la lista de Hannah French: Colleen Gottlieb'));
assert.ok(t.some(x => x === 'duplicate: Stephanie Cleary repetida en Heather Rex (CH7, CH7)'));
assert.ok(t.some(x => x === 'duplicate: Colleen Gottlieb repetida en Hannah French (1B, 10)'));
assert.strictEqual(p.length, 5, 'nothing else (WeTravel, cancelled, Cloudbeds copy, back-to-back CH6, past)');
const many = Array.from({ length: 60 }, (_, i) => ({ text: 'Cuarto ' + i + ' fuera de la lista de Alguien: Persona Número ' + i }));
const m = message(many);
assert.strictEqual(m.count, '60 pendientes'); assert.ok(m.detail.length < 940 && /y \d+ más$/.test(m.detail), 'long list summarised');
assert.strictEqual(message([{ text: 'a' }]).count, '1 pendiente');
console.log('room list check: all checks passed');
