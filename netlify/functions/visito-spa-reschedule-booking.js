'use strict';

// Visito AI "Tool" — a guest asking Lana to change their spa appointment
// time is ALWAYS sent to a human, full stop. Jorge's boss's ask
// 2026-09-26: "que siempre lo asigne a un humano y que el huésped no
// pueda hacerlo por si solo con visito... con eso se cometerían muchos
// menos errores" — and Jorge's follow-up 2026-09-26 rejecting an earlier
// version of this same tool that emailed the assigned therapist
// automatically: "esto yo no lo quiero... nada de emails a terapeutas."
//
// So this tool does nothing automated at all — no lookup, no email, no
// database write. It exists only so Lana has a deterministic, safe answer
// to give instead of trying to "help" some other way (e.g. calling
// spa_create_booking as a workaround, which would create a duplicate
// appointment and a duplicate folio charge).

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return jsonErr(405, 'Method Not Allowed');

  const expectedToken = process.env.VISITO_TOOL_SECRET;
  if (!expectedToken) return jsonErr(500, 'Server config error');
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  if (authHeader.replace(/^Bearer\s+/i, '').trim() !== expectedToken) return jsonErr(401, 'Unauthorized');

  return ok({
    success: true,
    handoffRequired: true,
    message: 'Los cambios de horario de una cita de spa siempre los debe hacer una persona del equipo. Dile al huésped que se comunique directamente con recepción o con el spa para reprogramar su cita — no intentes buscar, mover ni crear una cita nueva para esto.',
  });
};

function ok(body) { return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }
function jsonErr(code, msg) { return { statusCode: code, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: false, error: msg }) }; }
