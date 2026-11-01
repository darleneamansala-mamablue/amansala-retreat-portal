// Node harness for tsSubmitSchedule() (modules/teacher-portal.js): the teacher's form, filled from an older copy of the
// booking, must only send what the teacher changed in it -- never put back staff changes made meanwhile.
// Runs the REAL function, cut out of the module, in a vm sandbox with the DOM and helpers stubbed. node test/teacher-submit.test.js
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', 'modules', 'teacher-portal.js'), 'utf8').split('\n');
const fnStart = src.findIndex(l => l.startsWith('function tsSubmitSchedule()'));
let fnEnd = fnStart; while (src[fnEnd] !== '}') fnEnd++;
const SUBMIT = src.slice(fnStart, fnEnd + 1).join('\n');
const ENGINE = fs.readFileSync(path.join(__dirname, '..', 'modules', 'cas-sync.js'), 'utf8');

const DAYS = ['2027-03-02', '2027-03-03'];   // middle days of a 2027-03-01 -> 2027-03-04 retreat
function setup(liveBk, draft, orig) {
  const ctx = {
    console, JSON, Date, Math, Set, Map, Array, Object, String, Number, parseInt,
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: k => (k === 'teacher_bk_id' ? 'b1' : null) }, sessionStorage: { getItem: () => null },
    IS_TEACHER_MODE: true, casOn: true, saves: 0, toasts: [], flags: [],
  };
  vm.createContext(ctx);
  vm.runInContext(ENGINE + `
    const AppData={bookings:[${JSON.stringify(liveBk)}]};
    let _ts=${JSON.stringify(draft)}, _tsOrig=${orig === null ? 'null' : JSON.stringify(orig)};
    function svValidActivityDays(){return ${JSON.stringify(DAYS)}.map(date=>({date}));}
    function getNights(){return 3;} function pd(s){return new Date(s+'T00:00:00');} function fmtISO(d){return d.toISOString().slice(0,10);}
    function skedTemplateForDay(){return null;}
    function tsFlagRequired(id,msg){flags.push(msg);} function showToast(m){toasts.push(m);}
    function tsRenderStatus(){} function tsRenderCalSection(){}
    function casActive(){return casOn;}
    function saveAll(){saves++;}
    ${SUBMIT}
    this.go=()=>{tsSubmitSchedule();return AppData.bookings[0];};`, ctx);
  return ctx;
}
const day = (start) => ({ start, dur: 60, label: '', coTeacher: '', shala1: 'S1', flags: [] });
const baseDraft = () => ({ morningShala1: 'S1', hasAfternoon: false, offsiteChoice: 'onsite', offsiteNight: '2027-03-02', tourMode: 'a',
  dailyMorning: { [DAYS[0]]: day('08:00'), [DAYS[1]]: day('08:00') }, dailyAfternoon: {} });
const liveBkFrom = (sr, ovs) => ({ id: 'b1', startDate: '2027-03-01', endDate: '2027-03-04', retreatActivities: [{ aoId: 'ao1', date: '2027-03-02' }],
  scheduleRequest: sr, scheduleTimeOverrides: ovs, scheduleSkips: [] });
const ov = (date, start) => ({ date, period: 'morn', start, dur: 60, label: '', coTeacher: '', shala1: 'S1', flags: [] });

let passed = 0, failed = 0;
function run(name, fn) { try { fn(); console.log('ok   -', name); passed++; } catch (e) { console.error('FAIL -', name, '\n     ', e.message); failed++; } }

run('staff changes made after the form was filled are kept', () => {
  const orig = baseDraft();
  const draft = baseDraft(); draft.dailyMorning[DAYS[1]] = day('09:30');                 // teacher changes day 2 only
  // meanwhile staff: moved day 1 to 07:00, set a dinner time, switched offsite to Gitano
  const live = liveBkFrom({ ...(({ dailyMorning, dailyAfternoon, ...r }) => r)(orig), dinnerTimeOverride: '19:30', offsiteChoice: 'gitano', adminStatus: 'confirmed' },
    [ov(DAYS[0], '07:00'), ov(DAYS[1], '08:00')]);
  const ctx = setup(live, draft, orig);
  const bk = ctx.go();
  assert.deepStrictEqual(ctx.flags, [], 'no validation stop');
  assert.strictEqual(bk.scheduleRequest.dinnerTimeOverride, '19:30', 'staff dinner time kept');
  assert.strictEqual(bk.scheduleRequest.offsiteChoice, 'gitano', 'staff offsite kept');
  const starts = Object.fromEntries(bk.scheduleTimeOverrides.map(o => [o.date, o.start]));
  assert.strictEqual(starts[DAYS[0]], '07:00', 'staff per-day edit kept');
  assert.strictEqual(starts[DAYS[1]], '09:30', 'teacher change applied');
  assert.strictEqual(bk.scheduleRequest.adminStatus, 'confirmed');
  assert.strictEqual(bk.scheduleRequest.reviewNeeded, true);
});
run('a field the teacher changed wins over the saved one', () => {
  const orig = baseDraft();
  const draft = baseDraft(); draft.offsiteChoice = 'undecided';
  const live = liveBkFrom({ ...(({ dailyMorning, dailyAfternoon, ...r }) => r)(orig) }, [ov(DAYS[0], '08:00'), ov(DAYS[1], '08:00')]);
  const bk = setup(live, draft, orig).go();
  assert.strictEqual(bk.scheduleRequest.offsiteChoice, 'undecided');
});
run('first submit (nothing saved yet) sends the whole form', () => {
  const orig = { ...baseDraft(), dailyMorning: {} }, draft = baseDraft();   // the teacher filled every day in the form
  const bk = setup(liveBkFrom(null, []), draft, orig).go();
  assert.strictEqual(bk.scheduleRequest.morningShala1, 'S1');
  assert.strictEqual(bk.scheduleRequest.tourMode, 'a');
  assert.strictEqual(bk.scheduleTimeOverrides.length, 2);
});
run('without a recorded starting point it behaves as before (whole form)', () => {
  const draft = baseDraft(); draft.offsiteChoice = 'x';
  const bk = setup(liveBkFrom({ offsiteChoice: 'gitano', dinnerTimeOverride: '19:30' }, []), draft, null).go();
  assert.strictEqual(bk.scheduleRequest.offsiteChoice, 'x');
  assert.strictEqual(bk.scheduleRequest.dinnerTimeOverride, undefined);
});
run('safety net off: whole form, exactly as before', () => {
  const orig = baseDraft(), draft = baseDraft();
  const live = liveBkFrom({ offsiteChoice: 'gitano', dinnerTimeOverride: '19:30' }, [ov(DAYS[0], '07:00')]);
  const ctx = setup(live, draft, orig); ctx.casOn = false;
  const bk = ctx.go();
  assert.strictEqual(bk.scheduleRequest.offsiteChoice, 'onsite');
  assert.strictEqual(bk.scheduleRequest.dinnerTimeOverride, undefined);
  assert.strictEqual(bk.scheduleTimeOverrides.find(o => o.date === DAYS[0]).start, '08:00');
});
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
