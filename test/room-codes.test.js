// "1b" (a bed in a double) and "1B" (Garden Plus) are different rooms. A Transport upgrade that matched room codes ignoring
// case turned both into "1" and the 1B guests vanished from the retreat (Monica, 2026-11-02). Runs the real helpers from
// booking-hub.html and modules/transport.js. Run with: node test/room-codes.test.js
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const html = fs.readFileSync(path.join(__dirname, '..', 'booking-hub.html'), 'utf8');
const tr = fs.readFileSync(path.join(__dirname, '..', 'modules', 'transport.js'), 'utf8');
const fn = (src, re) => { const lines = src.split('\n'); const i = lines.findIndex(l => re.test(l)); if (i < 0) throw new Error('not found ' + re);
  if (/\{.*\}$/.test(lines[i]) && !/\{\s*$/.test(lines[i])) return lines[i]; for (let j = i + 1; j < lines.length; j++) if (lines[j] === '}') return lines.slice(i, j + 1).join('\n'); };
const code = [fn(html, /^let _roomCollisionCache/), fn(html, /^function _roomCodeCollisionSet\(\)/), fn(html, /^function roomCodesEqual\(/),
  fn(html, /^function roomListIncludes\(/), fn(tr, /^function _trSameRoom\(/)].join('\n');
const ctx = { AppData: { roomTypes: [{ rooms: ['1a', '1b', '13b'] }, { rooms: ['1'] }, { rooms: ['1B'] }, { rooms: ['13B'] }, { rooms: ['GV7'] }] } };
vm.createContext(ctx); vm.runInContext(code, ctx);
const list = ['3B', '1b', '1B', 'GV7'];
// Transport upgrade of the 1b guest into room 1 (same map as tr2 upgrade)
assert.deepStrictEqual(list.map(r => ctx._trSameRoom(r, '1b') ? '1' : r), ['3B', '1', '1B', 'GV7'], '1B untouched');
assert.ok(!ctx.roomCodesEqual('1b', '1B') && !ctx.roomCodesEqual('13b', '13B'), 'bed and room with the same letters differ');
assert.ok(ctx.roomCodesEqual('gv7', 'GV7') && ctx._trSameRoom(' GV7', 'gv7'), 'case still ignored when no other room shares the code');
assert.ok(ctx.roomListIncludes(list, '1B') && !ctx.roomListIncludes(['1b'], '1B'));
// a page without roomCodesEqual (driver view) compares exactly
const bare = {}; vm.createContext(bare); vm.runInContext(fn(tr, /^function _trSameRoom\(/), bare);
assert.ok(!bare._trSameRoom('1b', '1B') && bare._trSameRoom('1B ', '1B'));
console.log('room codes: all checks passed');
