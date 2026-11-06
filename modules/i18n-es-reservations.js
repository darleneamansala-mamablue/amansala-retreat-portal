// Spanish for Reservations / Arrivals / Departures — see modules/i18n.js
// Covers modules/reservations.js (Arrivals, In House, Departures, Advanced Search, AC 24hrs, Night Audit),
// departures-zero-last.js, the check-in form from checkin-by.js, room-move-sync.js's toast and the
// "Arriving today" block on the Dashboard (dashboard-arrivals-today.js).
i18nAdd({
  // tabs and titles
  'In House': 'En casa',
  'Advanced Search': 'Búsqueda avanzada',
  'AC 24hrs': 'A/C 24 hrs',
  'Night Audit': 'Auditoría nocturna',
  'Arrivals for': 'Llegadas del',
  'Departures for': 'Salidas del',
  '🖨 Print': '🖨 Imprimir',
  '❄️ A/C 24 Horas — in the hotel today': '❄️ A/C 24 Horas — en el hotel hoy',

  // table headers (Arrivals / In House / Departures / Search)
  'ROOM': 'CUARTO',
  'ROOM TYPE': 'TIPO DE CUARTO',
  'NAME': 'NOMBRE',
  'RATE / NIGHT': 'TARIFA / NOCHE',
  'SOURCE': 'ORIGEN',
  'BALANCE': 'SALDO',
  'CARD ON FILE': 'TARJETA REGISTRADA',
  'ONLINE CHECK-OUT': 'CHECK-OUT EN LÍNEA',
  'DISCOUNT': 'DESCUENTO',
  'NOTES': 'NOTAS',
  'ACTION': 'ACCIÓN',
  'Internal': 'Interna',

  // badges / row actions
  '✓ Checked In': '✓ Check In hecho',
  '✓ Checked Out': '✓ Check Out hecho',
  'CANCELLED': 'CANCELADA',
  'Take A/C 24 horas off this room': 'Quitar A/C 24 horas de este cuarto',

  // empty states
  'No guests in hotel today': 'No hay huéspedes en el hotel hoy',
  'No guests in the hotel with A/C 24 horas': 'No hay huéspedes en el hotel con A/C 24 horas',
  'No arrivals on Today': 'No hay llegadas hoy',
  'No departures on Today': 'No hay salidas hoy',

  // Advanced Search
  'Search Reservations': 'Buscar reservaciones',
  'CHECK-IN FROM': 'CHECK-IN DESDE',
  'CHECK-IN TO': 'CHECK-IN HASTA',
  'DISCOUNT CODE': 'CÓDIGO DE DESCUENTO',
  'First or last name': 'Nombre o apellido',
  'e.g. 22': 'ej. 22',
  'online, Escape, retreat name…': 'online, Escape, nombre del retiro…',
  'Clear': 'Limpiar',
  'Enter at least one search criteria.': 'Escribe al menos un criterio de búsqueda.',
  'No results found.': 'No se encontraron resultados.',

  // toasts
  'Checked in ✓': 'Check In hecho ✓',
  'Checked out ✓': 'Check Out hecho ✓',
  'Their check-in moved with them ✓': 'Su Check In se movió con ellos ✓',
  'Could not save. Try again.': 'No se pudo guardar. Intenta de nuevo.',

  // check-in form (checkin-by.js) and "who checked in" line
  'Optional. Saved with who checked them in; hover over the check-in later to read it.': 'Opcional. Se guarda junto con quién hizo el Check In; pasa el cursor sobre el Check In después para verlo.',
  'Was an upgrade offered?': '¿Se ofreció un upgrade?',
  'Accepted': 'Aceptado',
  'Declined': 'Rechazado',
  'Not offered': 'No se ofreció',
  'Were they shown room options?': '¿Se le mostraron opciones de cuarto?',
  'Which options (e.g. Beachfront King +$80, Garden Plus)': 'Qué opciones (ej. Beachfront King +$80, Garden Plus)',
  'e.g. declined the upgrade, wants a late checkout': 'ej. no quiso el upgrade, quiere late checkout',
  'Checked in · who not recorded': 'Check In hecho · no se registró quién',

  // Dashboard "Arriving today" block
  'Arriving today': 'Llegan hoy',
  '· the same list as the Daily Briefing': '· la misma lista del Resumen del día',
  'Nobody arriving that day.': 'Nadie llega ese día.',
  '(booking starts that day)': '(la reserva empieza ese día)',
  'Open the Daily Briefing for today →': 'Abrir el Resumen del día de hoy →',
  '· airport arrival': '· llegada al aeropuerto',
  'time TBD': 'hora por confirmar',
  'Arrived': 'Llegó',
  'Pending to arrive': 'Por llegar',
});

i18nAddRx([
  // guest / room / result counters
  [/^1 guest( ·)?$/, '1 huésped$1'],
  [/^(\d+) guests( ·)?$/, '$1 huéspedes$2'],
  [/^1 room$/, '1 cuarto'],
  [/^(\d+) rooms$/, '$1 cuartos'],
  [/^1 result found$/, '1 resultado encontrado'],
  [/^(\d+) results found$/, '$1 resultados encontrados'],
  [/^(\d+)\/(\d+) zero balance$/, '$1/$2 con saldo cero'],
  [/^(\d+) of (\d+) rooms occupied$/, '$1 de $2 cuartos ocupados'],

  // empty states with a date
  [/^No arrivals on (.+)$/, 'No hay llegadas el $1'],
  [/^No departures on (.+)$/, 'No hay salidas el $1'],

  // Online check-out tooltip: "Paid online $120.00 · Nov 6, 3:45 PM"
  [/^Paid online (.+)$/, 'Pagado en línea $1'],

  // Check Out confirms
  [/^Check out this guest from room (.+)\?$/, '¿Hacer Check Out de este huésped del cuarto $1?'],
  [/^Check out (.+) from room (.+)\?$/, '¿Hacer Check Out de $1 del cuarto $2?'],
  [/^Check out (.+) from this room\?$/, '¿Hacer Check Out de $1 de este cuarto?'],
  [/^Check out (.+) from (.+)\?$/, '¿Hacer Check Out de $1 de $2?'],

  // check-in form title and "Checked in by Cyan · Nov 6, 3:45 PM"
  [/^Check in guest$/, 'Check In del huésped'],
  [/^Check in (.+)$/, 'Check In de $1'],
  [/^Checked in by (.+)$/, 'Check In hecho por $1'],

  // Dashboard "Arriving today" block
  [/^Arriving on (.+)$/, 'Llegan el $1'],
  [/^Open the Daily Briefing for (.+) →$/, 'Abrir el Resumen del día del $1 →'],
  [/^· (\d+|\?) guests? · (\d+) rooms?$/, (m, g, r) => `· ${g} ${g === '1' ? 'huésped' : 'huéspedes'} · ${r} ${r === '1' ? 'cuarto' : 'cuartos'}`],
  [/^· (.+) · airport arrival$/, '· $1 · llegada al aeropuerto'],
]);
