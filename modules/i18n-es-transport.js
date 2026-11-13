// Spanish for Transport — see modules/i18n.js
// Covers the Transport tab (modules/transport.js tr2*), its edit / charge / auto-match windows, the weekly summary, and the
// add-ons that draw into its rows (transport-balances.js, transport-room-notes.js, transport-name-link.js,
// transport-no-reservation-alert.js, the Transport part of checkin-by.js). The print sheet opens in its own window and is
// already in Spanish, so it is not here. Much of the screen was already written in Spanish; only the English text is listed.
(function () {
  const MON = { Jan: 'ene', Feb: 'feb', Mar: 'mar', Apr: 'abr', May: 'may', Jun: 'jun', Jul: 'jul', Aug: 'ago', Sep: 'sep', Oct: 'oct', Nov: 'nov', Dec: 'dic' };
  const MONTH = { January: 'enero', February: 'febrero', March: 'marzo', April: 'abril', May: 'mayo', June: 'junio', July: 'julio', August: 'agosto', September: 'septiembre', October: 'octubre', November: 'noviembre', December: 'diciembre' };
  const DAY = { Sunday: 'domingo', Monday: 'lunes', Tuesday: 'martes', Wednesday: 'miércoles', Thursday: 'jueves', Friday: 'viernes', Saturday: 'sábado' };
  const DY = { Sun: 'dom', Mon: 'lun', Tue: 'mar', Wed: 'mié', Thu: 'jue', Fri: 'vie', Sat: 'sáb' };
  // "Nov 6" -> "6 nov"
  const shortDate = (m, d) => `${d} ${MON[m] || m}`;

  i18nAdd({
    // ----- top bar -----
    '🔗 Individual Link': '🔗 Link individual',
    '📋 Copy Guest Link': '📋 Copiar link de huéspedes',
    '📋 Copy Retreat Link': '📋 Copiar link del retiro',
    '💳 Charge': '💳 Cargar',
    'Cargar transport al folio': 'Cargar transporte al folio',
    'Vista de upgrades disponibles': 'Ver upgrades disponibles',
    // ----- filters bar -----
    'From': 'Desde',
    'To': 'Hasta',
    '✕ Clear': '✕ Limpiar',
    '📦 Archived': '📦 Archivados',

    // ----- empty list -----
    'No transport entries': 'No hay registros de transporte',
    'Try adjusting the filters': 'Prueba cambiando los filtros',
    'Guests submit their flight info via the transport form': 'Los huéspedes mandan su info de vuelo con el formulario de transporte',

    // ----- table columns -----
    'Options': 'Opciones',
    'Online check-out': 'Check Out en línea',

    // ----- section headers / banner -----
    'Teacher pays transport': 'El maestro paga el transporte',

    // ----- row badges -----
    '🛬 Arrival': '🛬 Llegada',
    '🛫 Departure': '🛫 Salida',
    'Missing': 'Falta',
    'Missing Information': 'Falta información',
    'Shared': 'Compartido',
    '💳 Teacher ✓': '💳 Maestro ✓',
    'Teacher': 'Maestro',
    'LANDED': 'ATERRIZÓ',
    'SCHEDULED': 'PROGRAMADO',
    'CANCELLED': 'CANCELADO',
    'ON TIME': 'A TIEMPO',
    'Checked in -- click to undo': 'Check In hecho -- clic para deshacer',
    'Click to check in': 'Clic para hacer Check In',
    'Open their booking': 'Abrir su reserva',
    // bill badge under the name (transport-balances.js)
    'Paid ✓': 'Pagado ✓',
    // notes column labels (transport-room-notes.js)
    'Room notes': 'Notas del cuarto',
    'Internal notes': 'Notas internas',
    'Transport Notes': 'Notas de transporte',
    'Guest form': 'Formulario del huésped',
    // check-in ticks on each arrival (checkin-by.js)
    'Offered Upgrade': 'Upgrade ofrecido',
    'Offered Upgrade ✓': 'Upgrade ofrecido ✓',
    'Offered Upgrade ✓ (accepted)': 'Upgrade ofrecido ✓ (aceptado)',
    'Offered Upgrade ✓ (declined)': 'Upgrade ofrecido ✓ (rechazado)',
    'Offered Upgrade ✓ (not offered)': 'Upgrade ofrecido ✓ (no ofrecido)',
    'Offered Upgrade ✓ (offered)': 'Upgrade ofrecido ✓ (ofrecido)',
    'Showed Options': 'Se mostraron opciones',
    'Showed Options ✓': 'Se mostraron opciones ✓',
    'Tick when an upgrade was offered': 'Marca cuando se ofreció un upgrade',
    'Tick when they were shown room options': 'Marca cuando se le mostraron opciones de cuarto',
    '✓ Checked in · who not recorded': '✓ Check In hecho · no se registró quién',
    'Could not save. Try again.': 'No se pudo guardar. Intenta de nuevo.',

    // ----- edit window -----
    'Not filled yet': 'Aún sin llenar',
    'Filled by guest': 'Llenado por el huésped',
    'Filled by staff': 'Llenado por staff',
    'Please fill in the arrival date before saving.': 'Llena la fecha de llegada antes de guardar.',
    'Please fill in the departure date before saving.': 'Llena la fecha de salida antes de guardar.',
    'Please fill in the arrival date and departure date before saving.': 'Llena la fecha de llegada y la fecha de salida antes de guardar.',

    // ----- toasts -----
    'Upgrades solo disponible en Arrivals': 'Upgrades solo disponibles en Llegadas',
    'Check-in removed': 'Check In quitado',
    'Individual link copiado ✓': 'Link individual copiado ✓',

    // ----- charge window -----
    '★ Al teacher': '★ Al maestro',

    // ----- "without a reservation" alert (transport-no-reservation-alert.js) -----
    '⚠ On the transport log without a reservation': '⚠ En transporte sin reservación',
    'Guests whose transport arrival is before their room reservation starts, with no reservation for that night. Add the extra night, or fix the arrival date.':
      'Huéspedes cuya llegada en transporte es antes de que empiece su reservación de cuarto, sin reservación para esa noche. Agrega la noche extra o corrige la fecha de llegada.',
    'Alert:': 'Alerta:',
    'is on the transport log for': 'está en transporte para el',
    'but does not have a reservation.': 'pero no tiene reservación.',
    'Nothing to check right now ✓': 'Nada que revisar por ahora ✓',
  });

  i18nAddRx([
    // top bar / filters
    [/^📦 Archived \((\d+)\)$/, '📦 Archivados ($1)'],
    // date header on today's rides: "📍 TODAY — Sunday, October 18"
    [/^📍 TODAY — (Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday), ([A-Z][a-z]+) (\d{1,2})$/,
      (m, wd, mo, d) => `📍 HOY — ${DAY[wd] || wd} ${d} de ${MONTH[mo] || mo}`],
    // section headers
    [/^Own Transport \((\d+)\)$/, 'Transporte propio ($1)'],
    [/^Missing Transport \((\d+)\)$/, 'Sin info de transporte ($1)'],
    // "Teacher pays transport" banner pieces (the · and spaces before them sit in the same text node)
    [/^(·\s*)?🛬 Arrivals:$/, '$1🛬 Llegadas:'],
    [/^(·\s*)?🛫 Departures:$/, '$1🛫 Salidas:'],
    // flight status from the flight monitor
    [/^DELAYED \+(\d+)min$/, 'RETRASADO +$1min'],
    [/^EARLY (-?\d+)min$/, 'ADELANTADO $1min'],
    // online check-out tick tooltip
    [/^Paid online \$([\d.,]+)$/, 'Pagado en línea $$$1'],
    // bill badge under the name
    [/^\$([\d,]+\.\d{2}) due$/, '$$$1 pendiente'],
    [/^Credit \$([\d,]+\.\d{2})$/, 'Crédito $$$1'],
    // guest name link tooltip
    [/^Open (.+) booking$/, 'Abrir reserva de $1'],
    // check-in tick tooltip / line once someone checked the guest in (checkin-by.js)
    [/^Checked in by (.+) -- click to undo$/, 'Check In hecho por $1 -- clic para deshacer'],
    [/^Checked in · who not recorded(.*) -- click to undo$/, 'Check In hecho · no se registró quién$1 -- clic para deshacer'],
    [/^✓ Checked in by (.+)$/, '✓ Check In hecho por $1'],
    // edit window: who filled it / last change
    [/^Filled by guest · ([A-Z][a-z]{2}) (\d{1,2})$/, (m, mo, d) => `Llenado por el huésped · ${shortDate(mo, d)}`],
    [/^Filled by staff: (.+?) · ([A-Z][a-z]{2}) (\d{1,2})$/, (m, who, mo, d) => `Llenado por staff: ${who} · ${shortDate(mo, d)}`],
    [/^Filled by staff · ([A-Z][a-z]{2}) (\d{1,2})$/, (m, mo, d) => `Llenado por staff · ${shortDate(mo, d)}`],
    [/^Filled by staff: (.+)$/, 'Llenado por staff: $1'],
    [/^Last change: the guest · ([A-Z][a-z]{2}) (\d{1,2})$/, (m, mo, d) => `Último cambio: el huésped · ${shortDate(mo, d)}`],
    [/^Last change: (.+?) · ([A-Z][a-z]{2}) (\d{1,2})$/, (m, who, mo, d) => `Último cambio: ${who === 'staff' ? 'staff' : who} · ${shortDate(mo, d)}`],
    [/^Last change: (.+?) ·$/, 'Último cambio: $1 ·'],
    // "without a reservation" alert
    [/^⚠ (\d+) on transport log without a reservation$/, '⚠ $1 en transporte sin reservación'],
    [/^(.+?)\s+is on the transport log for$/, '$1 está en transporte para el'],
    [/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat), ([A-Z][a-z]{2}) (\d{1,2})$/, (m, wd, mo, d) => `${DY[wd] || wd} ${shortDate(mo, d)}`],
    [/^(.*) · room reservation starts (Sun|Mon|Tue|Wed|Thu|Fri|Sat), ([A-Z][a-z]{2}) (\d{1,2})$/,
      (m, rt, wd, mo, d) => `${rt} · su reservación empieza el ${DY[wd] || wd} ${shortDate(mo, d)}`],
  ]);
})();
