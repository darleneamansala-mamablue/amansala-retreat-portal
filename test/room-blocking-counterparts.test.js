// A whole room and its beds block each other; two beds of one room do not; "1B" is its own room (2026-11-03: Hayden
// Bedsole in 4B while Wendy Oberg's 4B -a/-b looked free). Runs the real helpers from booking-hub.html.
// Run with: node test/room-blocking-counterparts.test.js
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const html = fs.readFileSync(path.join(__dirname, '..', 'booking-hub.html'), 'utf8');
const fn = (re) => { const lines = html.split('\n'); const i = lines.findIndex(l => re.test(l)); if (i < 0) throw new Error('not found ' + re);
  if (/\{.*\}$/.test(lines[i]) && !/\{\s*$/.test(lines[i])) return lines[i]; for (let j = i + 1; j < lines.length; j++) if (lines[j] === '}') return lines.slice(i, j + 1).join('\n'); };
const line = re => html.split('\n').find(l => re.test(l));
const code = [line(/^const ROOM_PARENT_TO_BED=/), line(/^const ROOM_BED_TO_PARENT=/), line(/^const VILLA_TO_SUBTYPES=/), fn(/^function splitDoubleHalf\(/),
  fn(/^let _roomCollisionCache/), fn(/^function _roomCodeCollisionSet\(\)/), fn(/^function roomCodesEqual\(/), fn(/^function roomListIncludes\(/),
  fn(/^function getRoomCounterparts\(/), fn(/^function roomBlockingCounterparts\(/), fn(/^function roomListBlocks\(/)].join('\n');
const ctx = { AppData: { roomTypes: [
  { id: 'rt6', rooms: ['4', '4B'] }, { id: 'bd1', rooms: ['4a', '4b', '4B -a', '4B -b'] },
  { id: 'rt7', rooms: ['1'] }, { id: 'bd2', rooms: ['1a', '1b'] }, { id: 'rt3', rooms: ['1B'] },
  { id: 'cm1', rooms: ['Casa Master'] }, { id: 'cg1', rooms: ['Casa King Downstairs'] } ] } };
vm.createContext(ctx); vm.runInContext(code, ctx);
assert.ok(ctx.roomListBlocks(['4B'], '4B -a'), 'whole room taken -> its bed is taken');
assert.ok(ctx.roomListBlocks(['4B -b'], '4B'), 'a bed taken -> its whole room is taken');
assert.ok(!ctx.roomListBlocks(['4B -b'], '4B -a'), 'sister bed stays free');
assert.ok(ctx.roomListBlocks(['1'], '1b') && ctx.roomListBlocks(['1a'], '1'), '1 <-> 1a/1b');
assert.ok(!ctx.roomListBlocks(['1B'], '1') && !ctx.roomListBlocks(['1'], '1B') && !ctx.roomListBlocks(['1B'], '1b'), '1B is its own room');
assert.ok(ctx.roomListBlocks(['Casa Master'], 'Casa King Downstairs') && ctx.roomListBlocks(['Casa King Downstairs'], 'Casa Master'), 'villa <-> its rooms');
assert.ok(!ctx.roomListBlocks(['4'], '4B -a'), '4 and 4B are different rooms');
console.log('room blocking counterparts: all checks passed');
