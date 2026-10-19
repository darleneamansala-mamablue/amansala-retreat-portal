// ===== staff-hours.js — Staff Hours for the Daily Briefing and the saved reports (Darlene 2026-10-18) =====
// Loaded as a classic script before daily-briefing.js; shares global scope. Standalone; READ-ONLY.
// Where the hours come from: the Team Pendings staff records (its own database): employees (name, team = department), shift_assignments (the
// scheduled shift, written as text like "10:00 AM-12:00 PM"), shift_clock (actual clock in / clock out) and attendance_notes (late / no-show).
// Only name, team, role and the shifts are read: never the PIN or the pay rate.
// NOTHING IS INVENTED. What those records do not hold is flagged instead:
//   - breaks are not recorded anywhere in them                      -> shown as "Not recorded"
//   - Housekeeping, Cajeras, Kitchen, Restaurant Captain, Front Desk -> flagged "no staff-hours records connected" until they exist as teams
//     there (the Online Team and Management are what is in Team Pendings today)
//   - the Amansala Ops Dashboard (yoga / spa area shifts)           -> flagged "not connected"
// Scheduled hours = the shift's start to finish as written. Actual hours = clock out minus clock in, only for finished clock records.
// The two are always shown in separate columns.
const SH_URL = 'https://foqgompuzvhdgeehcnkx.supabase.co/rest/v1';
const SH_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZvcWdvbXB1enZoZGdlZWhjbmt4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwNTk2NzcsImV4cCI6MjEwNDYzNTY3N30.C5MjKrRQUMeIBsRsuFaYku0QLx-NiCGvWBddPktzf_Q';
const SH_PROPERTY_DEPTS = ['Housekeeping', 'Cajeras', 'Kitchen', 'Restaurant Captain', 'Front Desk'];
const SH_TZ = 'America/Cancun';

async function shFetch(path) {
  const r = await fetch(SH_URL + '/' + path, { headers: { apikey: SH_KEY, Authorization: 'Bearer ' + SH_KEY } });
  if (!r.ok) throw new Error('Team Pendings answered ' + r.status);
  return r.json();
}
function shEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
function shAddDay(iso, n) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function shTime(iso) { return iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: SH_TZ }) : ''; }
function shFmtMin(m) { m = ((m % 1440) + 1440) % 1440; const h = Math.floor(m / 60); return ((h % 12) || 12) + ':' + String(m % 60).padStart(2, '0') + ' ' + (h >= 12 ? 'PM' : 'AM'); }
function shHours(n) { return n == null ? '' : (Math.round(n * 100) / 100) + ' h'; }
// "10:00 AM-12:00 PM" (hyphen, en dash or em dash) -> { start, end, hours, label } or null when it can't be read
function shParse(text) {
  const m = String(text || '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*[-–—]+\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return null;
  const to = (h, mn, ap) => { let x = Number(h) % 12; if (/pm/i.test(ap)) x += 12; return x * 60 + Number(mn); };
  const start = to(m[1], m[2], m[3]); let end = to(m[4], m[5], m[6]); if (end <= start) end += 1440;   // crosses midnight
  return { start, end, hours: (end - start) / 60, label: shFmtMin(start) + ' – ' + shFmtMin(end) };
}
async function shLoad(date) {
  const out = { ok: false, date, reason: '', rows: [], flags: [], connected: [], employees: 0 };
  try {
    const next = shAddDay(date, 1);
    const [emps, assigns, clocks, notes] = await Promise.all([
      shFetch('employees?select=id,name,team,role,active&order=name'),
      shFetch('shift_assignments?select=employee_id,shift_date,shift&shift_date=eq.' + date),
      shFetch('shift_clock?select=employee_id,clock_in,clock_out&clock_in=gte.' + encodeURIComponent(date + 'T00:00:00-05:00') + '&clock_in=lt.' + encodeURIComponent(next + 'T00:00:00-05:00') + '&order=clock_in'),
      shFetch('attendance_notes?select=employee_id,status,note&work_date=eq.' + date),
    ]);
    out.ok = true; out.employees = emps.length;
    const byId = {}; emps.forEach(e => { byId[e.id] = e; });
    const ids = new Set([...assigns.map(a => a.employee_id), ...clocks.map(c => c.employee_id), ...notes.map(n => n.employee_id)]);
    ids.forEach(id => {
      const e = byId[id]; if (!e) return;
      const shifts = assigns.filter(a => a.employee_id === id).map(a => ({ text: a.shift, p: shParse(a.shift) }));
      const cl = clocks.filter(c => c.employee_id === id);
      const parsed = shifts.filter(s => s.p), unparsed = shifts.filter(s => !s.p);
      const done = cl.filter(c => c.clock_out), open = cl.filter(c => !c.clock_out);
      out.rows.push({
        name: e.name, department: e.team || 'Unassigned', role: e.role,
        shifts, scheduledHours: parsed.length ? parsed.reduce((n, s) => n + s.p.hours, 0) : null, unparsed: unparsed.length,
        clocks: cl.map(c => ({ in: shTime(c.clock_in), out: c.clock_out ? shTime(c.clock_out) : null })),
        actualHours: done.length ? done.reduce((n, c) => n + (new Date(c.clock_out) - new Date(c.clock_in)) / 3600000, 0) : null, stillIn: open.length,
        notes: notes.filter(n => n.employee_id === id).map(n => n.status.replace('_', ' ') + (n.note ? ' (' + n.note + ')' : '')),
      });
    });
    out.rows.sort((a, b) => a.department.localeCompare(b.department) || a.name.localeCompare(b.name));
    const teams = new Set(emps.map(e => String(e.team || '').toLowerCase()));
    out.connected.push(`Team Pendings staff records: ${emps.length} staff in ${[...new Set(emps.map(e => e.team))].join(' and ') || 'no team'}`);
    const missing = SH_PROPERTY_DEPTS.filter(d => !teams.has(d.toLowerCase()));
    if (missing.length) out.flags.push(`No staff-hours records are connected for ${missing.join(', ')}. Their hours are not shown rather than guessed.`);
    out.flags.push('Breaks are not recorded in the connected staff records, so they are shown as "Not recorded".');
    out.flags.push('The Amansala Ops Dashboard (yoga and spa area shifts) is not connected to the portal.');
  } catch (e) {
    out.reason = e.message || String(e);
    out.flags.push('Staff hours could not be loaded: ' + out.reason + '. Nothing is shown rather than guessing.');
  }
  return out;
}
function shHtml(h) {
  const flag = t => `<div style="padding:8px 14px;border-top:1px solid #f0ebe0;background:#fffbeb;font-size:12.5px;color:#92400e">&#9888; ${shEsc(t)}</div>`;
  const th = 'padding:7px 8px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#6b7280;border-bottom:1.5px solid #e8dfd4;white-space:nowrap';
  const td = 'padding:7px 8px;border-top:1px solid #f0ebe0;font-size:13px;vertical-align:top';
  let body;
  if (!h || !h.ok) body = `<div style="padding:12px 14px;color:#991b1b;font-weight:600">Staff hours are not connected right now. ${shEsc((h && h.reason) || '')}</div>`;
  else if (!h.rows.length) body = `<div style="padding:12px 14px;color:#9ca3af">Nobody in the connected staff records has a shift or a clock-in on this day.</div>`;
  else {
    const depts = {};
    h.rows.forEach(r => { (depts[r.department] = depts[r.department] || []).push(r); });
    body = `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse"><thead><tr>
      <th style="${th}">Employee</th><th style="${th}">Department</th><th style="${th}">Scheduled start – finish</th><th style="${th}">Breaks</th><th style="${th}">Scheduled hours</th>
      <th style="${th};border-left:2px solid #e8dfd4">Actual clock in / out</th><th style="${th}">Actual hours</th><th style="${th}">Notes</th></tr></thead><tbody>` +
      Object.keys(depts).map(d => {
        const rs = depts[d], sch = rs.reduce((n, r) => n + (r.scheduledHours || 0), 0), act = rs.reduce((n, r) => n + (r.actualHours || 0), 0);
        return rs.map(r => `<tr>
          <td style="${td};font-weight:700">${shEsc(r.name)}</td><td style="${td}">${shEsc(r.department)}</td>
          <td style="${td}">${r.shifts.length ? r.shifts.map(s => s.p ? shEsc(s.p.label) : `<span style="color:#b45309">${shEsc(s.text)} (can't read the times)</span>`).join('<br>') : '<span style="color:#9ca3af">No shift scheduled</span>'}</td>
          <td style="${td};color:#92400e">Not recorded</td>
          <td style="${td};font-weight:600">${r.scheduledHours != null ? shHours(r.scheduledHours) : '<span style="color:#9ca3af">&mdash;</span>'}</td>
          <td style="${td};border-left:2px solid #e8dfd4">${r.clocks.length ? r.clocks.map(c => shEsc(c.in) + ' – ' + (c.out ? shEsc(c.out) : '<b style="color:#1d4ed8">still clocked in</b>')).join('<br>') : '<span style="color:#9ca3af">No clock-in</span>'}</td>
          <td style="${td};font-weight:600">${r.actualHours != null ? shHours(r.actualHours) : '<span style="color:#9ca3af">&mdash;</span>'}${r.stillIn ? '<div style="font-size:11px;color:#1d4ed8;font-weight:500">+ still clocked in</div>' : ''}</td>
          <td style="${td};font-size:12px">${r.notes.length ? shEsc(r.notes.join(', ')) : ''}</td></tr>`).join('') +
          `<tr style="background:#faf8f4"><td style="${td};font-weight:700" colspan="4">${shEsc(d)} total</td><td style="${td};font-weight:700">${shHours(sch)}</td><td style="${td};border-left:2px solid #e8dfd4"></td><td style="${td};font-weight:700">${shHours(act)}</td><td style="${td}"></td></tr>`;
      }).join('') + '</tbody></table></div>';
  }
  return body + ((h && h.flags) || []).map(flag).join('');
}
function shLines(h) {
  const L = [];
  if (!h || !h.ok) { L.push('Staff hours were not connected: ' + ((h && h.reason) || 'no connection') + '.'); return L; }
  if (!h.rows.length) L.push('No shifts or clock-ins in the connected staff records.');
  h.rows.forEach(r => L.push(`${r.name} (${r.department}) | scheduled ${r.shifts.map(s => s.p ? s.p.label : s.text + ' [unreadable]').join(' + ') || 'none'} | breaks: not recorded | scheduled hours ${r.scheduledHours != null ? shHours(r.scheduledHours) : 'n/a'} | actual ${r.clocks.length ? r.clocks.map(c => c.in + '-' + (c.out || 'still in')).join(', ') : 'no clock-in'} | actual hours ${r.actualHours != null ? shHours(r.actualHours) : 'n/a'}${r.notes.length ? ' | ' + r.notes.join(', ') : ''}`));
  (h.flags || []).forEach(f => L.push('FLAG: ' + f));
  return L;
}
