// Spanish for Spa — see modules/i18n.js
// Covers the Spa tab of the portal: Dashboard, Confirmations, Calendar (and its add-ons: time blocks, Google Calendar,
// last-minute, balance advisor, rule alerts, guide blocks, request markers, confirm labels, recovery list), Services,
// Therapists, Rooms, Public Page links, Auto-Assign rules, Payroll, Reports, Not Charged, Day Report, Who booked,
// the service / therapist / room / appointment windows, and the spa-staff login. The public pages (spa-booking.html,
// spa-landing.html, spa-payroll.html) are not here. Service, therapist, room and guest names are data and never keys.
(function () {
  const MON = { Jan: 'ene', Feb: 'feb', Mar: 'mar', Apr: 'abr', May: 'may', Jun: 'jun', Jul: 'jul', Aug: 'ago', Sep: 'sep', Oct: 'oct', Nov: 'nov', Dec: 'dic' };
  const MONTH = { January: 'enero', February: 'febrero', March: 'marzo', April: 'abril', May: 'mayo', June: 'junio', July: 'julio', August: 'agosto', September: 'septiembre', October: 'octubre', November: 'noviembre', December: 'diciembre' };
  const DAY = { Sunday: 'domingo', Monday: 'lunes', Tuesday: 'martes', Wednesday: 'miércoles', Thursday: 'jueves', Friday: 'viernes', Saturday: 'sábado' };
  const DY = { Sun: 'dom', Mon: 'lun', Tue: 'mar', Wed: 'mié', Thu: 'jue', Fri: 'vie', Sat: 'sáb' };
  // "Thu, Nov 6" -> "jue 6 nov", "Nov 6" -> "6 nov", "Thursday, November 6" -> "jueves 6 de noviembre"; anything else unchanged
  const esDate = s => {
    let m;
    if ((m = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat), (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2})$/.exec(s))) return `${DY[m[1]]} ${m[3]} ${MON[m[2]]}`;
    if ((m = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2})$/.exec(s))) return `${m[2]} ${MON[m[1]]}`;
    if ((m = /^(\w+day), (\w+) (\d{1,2})(?:, (\d{4}))?$/.exec(s)) && DAY[m[1]] && MONTH[m[2]]) return `${DAY[m[1]]} ${m[3]} de ${MONTH[m[2]]}${m[4] ? ' de ' + m[4] : ''}`;
    return s;
  };
  const DATE = '((?:Sun|Mon|Tue|Wed|Thu|Fri|Sat), (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \\d{1,2})';
  const pl = (n, one, many) => (Number(n) === 1 ? one : many);
  const FIELD = { 'Client': 'Cliente', 'Service': 'Servicio', 'Therapist': 'Terapeuta', 'Room': 'Sala', 'Date': 'Fecha', 'Start Time': 'Hora de inicio', 'Duration': 'Duración', 'Status': 'Estado', 'Payment Status': 'Estado de pago' };
  const ROLE = { 'Shaman': 'Chamán', 'Fire keeper': 'Guardián del fuego', 'Leading': 'Dirige', 'Guide': 'Guía' };
  // one sentence of the auto-assign rule list (spa-rule-alerts.js); unknown text comes back unchanged
  const ruleText = s => {
    let m;
    if ((m = /^(.+) has (\d+) services \(the limit is (\d+)\)\.$/.exec(s))) return `${m[1]} tiene ${m[2]} servicios (el límite es ${m[3]}).`;
    if ((m = /^(.+) is double-booked at (.+?) \((.+) and (.+)\)\.$/.exec(s))) return `${m[1]} tiene doble cita a las ${m[2]} (${m[3]} y ${m[4]}).`;
    if ((m = /^(.+) has no break: service (\d+) \((.+?)\) starts (\d+) minutes after service (\d+) ends\. A (\d+)-minute break is needed after (\d+) services\.$/.exec(s)))
      return `${m[1]} no tiene descanso: el servicio ${m[2]} (${m[3]}) empieza ${m[4]} minutos después de que termina el servicio ${m[5]}. Necesita un descanso de ${m[6]} minutos después de ${m[7]} servicios.`;
    if ((m = /^(.+) has only (\d+) minutes between (.+) and (.+) \(the profile asks for (\d+)\)\.$/.exec(s))) return `${m[1]} solo tiene ${m[2]} minutos entre ${m[3]} y ${m[4]} (su perfil pide ${m[5]}).`;
    if ((m = /^(.+) gets (no break|only (\d+) minutes) after (\d+) back-to-back services \(next one (.+?)\); a (\d+)-minute break is needed\.$/.exec(s)))
      return `${m[1]} tiene ${m[3] ? 'solo ' + m[3] + ' minutos' : 'cero descanso'} después de ${m[4]} servicios seguidos (el siguiente a las ${m[5]}); necesita un descanso de ${m[6]} minutos.`;
    return s;
  };
  // "booked at 3:00 PM, 2 hours before the service" (spa-last-minute.js)
  const lmText = s => {
    const m = /^booked at (.+?), (\d+) (hours|minutes) (after the start time|before the service)$/.exec(s);
    if (!m) return s;
    return `reservada a las ${m[1]}, ${m[2]} ${m[3] === 'hours' ? 'horas' : 'minutos'} ${m[4] === 'before the service' ? 'antes del servicio' : 'después de la hora de inicio'}`;
  };

  i18nAdd({
    // ----- spa sub-menu -----
    'Calendar': 'Calendario', 'Services': 'Servicios', 'Therapists': 'Terapeutas', 'Public Page': 'Página pública',
    'Auto-Assign': 'Asignación automática', '🔒 Payroll': '🔒 Nómina', '✔ Confirmations': '✔ Confirmaciones',
    '📊 Reports': '📊 Reportes', '⚠ Not Charged': '⚠ Sin cargar',
    'New Service': 'Nuevo servicio', 'New Therapist': 'Nuevo terapeuta', 'New Room': 'Nueva sala',
    'Spa settings were reloaded from the server — please make that change again.': 'La configuración del spa se volvió a cargar del servidor — por favor haz ese cambio otra vez.',
    'The spa calendar could NOT save that change. Check the connection and try again. Nothing has been lost on screen.': 'El calendario del spa NO pudo guardar ese cambio. Revisa la conexión e intenta de nuevo. No se perdió nada en pantalla.',

    // ----- dashboard -----
    'Services Sold': 'Servicios vendidos', 'Services Completed': 'Servicios completados', 'Revenue (Completed)': 'Ingresos (completados)',
    'Profit of the Day': 'Ganancia del día', 'after costs & therapist pay': 'después de costos y pago a terapeutas',
    'How Busy Are We': 'Qué tan ocupados estamos', 'to': 'a', 'Guests Onsite': 'Huéspedes en el hotel', 'Guests Onsite (avg)': 'Huéspedes en el hotel (prom.)',
    'Day by day': 'Día por día', 'Massages Booked': 'Masajes reservados', 'Guests With No Massage Yet': 'Huéspedes sin masaje todavía',
    'In-House (Charged to Room)': 'Hospedados (cargo al cuarto)', 'Package Massage Not Yet Booked': 'Masaje de paquete sin reservar',
    'entitled by their retreat package, no appointment on the books yet': 'incluido en su paquete de retiro, todavía sin cita agendada',
    'Show names': 'Ver nombres',
    'Any male therapist': 'Cualquier terapeuta hombre', 'Any female therapist': 'Cualquier terapeuta mujer', 'Unassigned': 'Sin asignar',
    "Included in the guest's package — not charged to the room": 'Incluido en el paquete del huésped — no se carga al cuarto',
    '✦ Pre-Paid': '✦ Prepagado', '✓ Charged to Room': '✓ Cargado al cuarto', '🧾 Charge to Room': '🧾 Cargar al cuarto',
    "No registered guest matches this appointment's name or room — check the room number/name, then charge it manually.": 'Ningún huésped registrado coincide con el nombre o cuarto de esta cita — revisa el número de cuarto o el nombre y luego cárgalo a mano.',
    '⚠ No Room Match': '⚠ Sin cuarto que coincida', '✓ Charged': '✓ Cargado', '🧾 Charge': '🧾 Cargar', '⚠ No Match': '⚠ Sin coincidencia',
    '✓ Confirmed': '✓ Confirmado', 'Service': 'Servicio', 'Client': 'Cliente', 'Therapist': 'Terapeuta',
    'No services booked for this day.': 'No hay servicios reservados para este día.',

    // ----- confirmations -----
    'Upcoming Confirmations': 'Próximas confirmaciones', 'All caught up ✓': 'Todo al día ✓',
    'Search by guest, therapist, or service…': 'Buscar por huésped, terapeuta o servicio…',
    'Status:': 'Estado:', 'Category:': 'Categoría:', 'Show All': 'Ver todo', 'Nothing in this view.': 'No hay nada en esta vista.',
    'Confirmed by therapist': 'Confirmado por el terapeuta', 'Confirmed by staff': 'Confirmado por el staff',
    'Confirmed (who not recorded)': 'Confirmado (no se registró quién)', '✓ Confirmed by therapist': '✓ Confirmado por el terapeuta',
    'Not confirmed': 'Sin confirmar', 'Not yet confirmed by the therapist': 'El terapeuta todavía no confirma',
    'Confirmed by the therapist': 'Confirmado por el terapeuta',

    // ----- charge to room -----
    "This is Pre-Paid — included in the guest's package, not charged to the room.": 'Esta es prepagada — incluida en el paquete del huésped, no se carga al cuarto.',
    'Already charged to this room.': 'Ya está cargada a este cuarto.',
    'No matching registered guest found.': 'No se encontró un huésped registrado que coincida.',
    'This service has no price set — add one in Services first.': 'Este servicio no tiene precio — agrégalo primero en Servicios.',

    // ----- payroll -----
    'Payroll Access': 'Acceso a nómina',
    'This shows what each therapist earns. Enter the access code to continue.': 'Aquí se ve lo que gana cada terapeuta. Escribe el código de acceso para continuar.',
    'Access code': 'Código de acceso', 'Unlock': 'Desbloquear', 'Incorrect code.': 'Código incorrecto.', 'Lock': 'Bloquear',
    'No completed appointments yet — payroll fills in as services are marked Completed on the calendar.': 'Todavía no hay citas completadas — la nómina se llena conforme los servicios se marcan como Completados en el calendario.',
    '💵 Tips by Therapist': '💵 Propinas por terapeuta',
    'Run Report': 'Generar reporte', 'This Week': 'Esta semana', 'This Month': 'Este mes', 'All Time': 'Todo el tiempo',
    'From': 'Desde', 'To': 'Hasta',
    '"From" is after "To" — swap the dates.': '"Desde" es después de "Hasta" — invierte las fechas.',

    // ----- services -----
    'No services yet.': 'Todavía no hay servicios.', 'Duration TBD': 'Duración por definir', 'Price TBD': 'Precio por definir',
    '(group)': '(grupo)', 'Room required': 'Requiere sala', 'Group Ceremony': 'Ceremonia grupal',
    'Costs:': 'Costos:', 'Margin before therapist pay:': 'Margen antes del pago al terapeuta:', '— set a price to see margin': '— pon un precio para ver el margen',    'Edit Service': 'Editar servicio', 'Reactivate Service': 'Reactivar servicio', 'Deactivate Service': 'Desactivar servicio', 'Save Service': 'Guardar servicio',
    'Please enter a service name.': 'Escribe el nombre del servicio.',
    'Duration must be in 15-minute increments (15, 30, 45, 60…).': 'La duración debe ir en bloques de 15 minutos (15, 30, 45, 60…).',
    'Name *': 'Nombre *', 'Description': 'Descripción', 'Duration (min) *': 'Duración (min) *', 'Buffer (min)': 'Margen entre citas (min)',
    'Price (USD) *': 'Precio (USD) *', 'Costs per Treatment (USD)': 'Costos por tratamiento (USD)',
    '— therapist pay is set per-therapist below and factored in automatically': '— el pago al terapeuta se define por terapeuta y se toma en cuenta automáticamente',
    'Laundry': 'Lavandería', 'Supplies/Oil': 'Insumos/aceite', 'Staff Meals': 'Comidas del staff', 'Other (Cost of Therapist)': 'Otro (costo del terapeuta)',
    'Category': 'Categoría', 'Body Work (massage, facial, etc.)': 'Trabajo corporal (masaje, facial, etc.)',
    'Spirit Work (aura, tarot, breathwork, etc.)': 'Trabajo espiritual (aura, tarot, respiración, etc.)',
    'Dance': 'Baile', 'Room required?': '¿Requiere sala?', 'Booking Type': 'Tipo de reserva',
    '— which step guests see this under': '— en qué paso lo ven los huéspedes', 'One-on-One Treatment': 'Tratamiento individual',
    'Guests can request a female/male therapist for this service': 'Los huéspedes pueden pedir terapeuta mujer/hombre para este servicio',
    'e.g. 60 Minute Massage': 'ej. Masaje de 60 minutos',

    // ----- therapists -----
    'Inactive': 'Inactivo', 'Inactive / Muted': 'Inactivos / silenciados', 'Other': 'Otros',
    'No therapists yet — add your first one.': 'Todavía no hay terapeutas — agrega el primero.',
    'Body Workers': 'Trabajo corporal', 'Spirit Workers': 'Trabajo espiritual',
    '🪷 Body Workers': '🪷 Trabajo corporal', '🦋 Spirit Workers': '🦋 Trabajo espiritual', '💪 Fitness': '💪 Fitness', '💃 Dance': '💃 Baile',
    'Body Work': 'Trabajo corporal', '🪷 Body Work': '🪷 Trabajo corporal', 'Spirit or Movement': 'Espiritual o movimiento', '🌿 Spirit or Movement': '🌿 Espiritual o movimiento',
    '🌿 Fitness, Yoga & Spirit': '🌿 Fitness, yoga y espiritual', 'Spirit, Movement & Tours': 'Espiritual, movimiento y tours', '🌿 Spirit, Movement & Tours': '🌿 Espiritual, movimiento y tours',
    'Tours': 'Tours', '🧭 Tours': '🧭 Tours',    'Add services first.': 'Primero agrega servicios.', 'Fixed': 'Fijo', '% of price': '% del precio', 'Hourly': 'Por hora', 'rate': 'tarifa',
    'Edit Therapist': 'Editar terapeuta', 'Save Therapist': 'Guardar terapeuta', 'Please enter a first name.': 'Escribe el nombre.',
    'First Name *': 'Nombre *', 'Last Name': 'Apellido', 'Photo & Bio': 'Foto y bio', '— for the spa portfolio': '— para el portafolio del spa',
    'Upload': 'Subir', 'A short bio guests can see when choosing a specific therapist…': 'Una bio corta que los huéspedes ven al elegir un terapeuta…',
    'Gender': 'Género', 'Female': 'Mujer', 'Male': 'Hombre', 'Other / prefer not to say': 'Otro / prefiere no decir',
    'Default Room': 'Sala predeterminada', '— None —': '— Ninguna —', '— Select —': '— Seleccionar —',
    "— which single group they're listed under (someone doing multiple things, e.g. Sergio, only shows once)": '— en qué grupo aparece (quien hace varias cosas, p. ej. Sergio, solo aparece una vez)',
    'Auto (show under every category they have a service in)': 'Automático (aparece en cada categoría donde tiene un servicio)',
    'Tours (guides)': 'Tours (guías)', 'Services performed & pay rate': 'Servicios que realiza y tarifa de pago', 'Active': 'Activo',
    'Booking rules': 'Reglas de reserva', '(used by the public booking page; leave blank for no limit)': '(las usa la página pública de reservas; déjalo vacío para no tener límite)',
    'Max services per day': 'Máximo de servicios por día', 'Break after each service (minutes)': 'Descanso después de cada servicio (minutos)',
    'No limit': 'Sin límite', '0 = back to back': '0 = seguidos',
    'Always assign to': 'Asignar siempre a', '(public booking page)': '(página pública de reservas)', 'Any available therapist': 'Cualquier terapeuta disponible',
    'If a therapist is chosen here, guests are only ever booked with them for this service. Staff can still reassign it on the calendar.': 'Si eliges un terapeuta aquí, los huéspedes siempre se reservan con esa persona para este servicio. El staff todavía puede reasignarlo en el calendario.',

    // ----- rooms -----
    'No rooms yet.': 'Todavía no hay salas.', 'Edit Room': 'Editar sala', 'Room Name *': 'Nombre de la sala *', 'Location': 'Ubicación',
    'Delete Room': 'Eliminar sala', 'Save Room': 'Guardar sala', 'Please enter a room name.': 'Escribe el nombre de la sala.',
    'Delete this room? This cannot be undone.': '¿Eliminar esta sala? No se puede deshacer.', 'e.g. Spa Room 1': 'ej. Sala 1', 'e.g. Grande': 'ej. Grande',

    // ----- public page links -----
    'Links to send to guests (open to everyone, no login)': 'Links para mandar a los huéspedes (abiertos a todos, sin iniciar sesión)',
    'Spa booking page (all services)': 'Página de reservas del spa (todos los servicios)', 'Guests choose any service and book. No login.': 'Los huéspedes eligen cualquier servicio y reservan. Sin iniciar sesión.',
    'Spa information page': 'Página de información del spa', 'Menu, therapists and a Book button.': 'Menú, terapeutas y un botón para reservar.',
    'Copy link': 'Copiar link', 'Copied ✓': 'Copiado ✓', 'Copy this link:': 'Copia este link:',

    // ----- auto-assign rules -----
    'Female rotation': 'Rotación de mujeres',
    'Order "no preference"/"female" bookings cycle through — repeat a name for extra turns (e.g. Laura twice in a row).': 'Orden en que se reparten las reservas "sin preferencia"/"mujer" — repite un nombre para darle más turnos (p. ej. Laura dos veces seguidas).',
    'Rotation (in order)': 'Rotación (en orden)', 'Comma-separated, e.g. "Laura, Laura, Gabby, Graciela"': 'Separados por comas, p. ej. "Laura, Laura, Gabby, Graciela"',
    'Last resort': 'Último recurso', 'Only used when nobody above can take the booking': 'Solo se usa cuando nadie de arriba puede tomar la reserva',
    'Male rotation': 'Rotación de hombres', 'Primary therapist gets priority up to the cap below, then alternates with the secondary.': 'El terapeuta principal tiene prioridad hasta el tope de abajo; después se alterna con el secundario.',
    'Primary': 'Principal', "Primary's priority cap / day": 'Tope de prioridad del principal / día', 'Secondary (alternates after cap)': 'Secundario (se alterna después del tope)',
    'No gender preference': 'Sin preferencia de género', 'Try first': 'Probar primero', 'Falls through to the other if nobody is free': 'Pasa a la otra si nadie está libre',
    'Maria Luisa (Mayan healing)': 'Maria Luisa (sanación maya)',
    "She's already the only one offered Mayan-healing services (set per-service). This is just her staged break pattern.": 'Ella ya es la única que ofrece los servicios de sanación maya (se define por servicio). Esto es solo su patrón de descansos.',
    'Her name (must match Therapists tab)': 'Su nombre (igual que en la pestaña Terapeutas)', 'Services before a break': 'Servicios antes de un descanso',
    'Break length (minutes)': 'Duración del descanso (minutos)', 'Daily cap (automatic bookings)': 'Tope diario (reservas automáticas)',
    'Staff can still book her past this by hand in the Calendar': 'El staff todavía puede reservarle más a mano en el Calendario',
    'Everyone else (default)': 'Todos los demás (predeterminado)', 'Applies to any therapist without their own override on the Therapists tab.': 'Aplica a cualquier terapeuta que no tenga su propia regla en la pestaña Terapeutas.',
    'Break after this many in a row': 'Descanso después de esta cantidad seguidos', 'Save Rules': 'Guardar reglas', 'Saved ✓': 'Guardado ✓',
    'The female rotation needs at least one name.': 'La rotación de mujeres necesita al menos un nombre.',
    'Both male rotation names are required.': 'Se necesitan los dos nombres de la rotación de hombres.',
    'Could not save — try again.': 'No se pudo guardar — intenta de nuevo.',

    // ----- calendar toolbar -----
    'By Therapist': 'Por terapeuta', 'By Room': 'Por sala', 'New Appointment': 'Nueva cita', 'View:': 'Vista:',
    '\u{1F553} Show all hours': '\u{1F553} Ver todas las horas', '\u{1F553} Hide hours': '\u{1F553} Ocultar horas',
    'Show 7 AM to 9 PM again': 'Volver a mostrar de 7 AM a 9 PM', 'Hide the hours with no appointments': 'Ocultar las horas sin citas',
    '🔇 Muted:': '🔇 Silenciados:',
    'No active therapists yet — add one in the Therapists tab.': 'Todavía no hay terapeutas activos — agrega uno en la pestaña Terapeutas.',
    'No active therapists in this category yet.': 'Todavía no hay terapeutas activos en esta categoría.',
    'Not yet confirmed by the therapist — click to confirm on their behalf': 'El terapeuta todavía no confirma — clic para confirmar de su parte',
    '📊 Who booked': '📊 Quién reservó', '📊 Day Report': '📊 Reporte del día', '⛔ Block time': '⛔ Bloquear horario',
    '📅 Google Calendar': '📅 Google Calendar', '📅 Google Calendar ✓': '📅 Google Calendar ✓',
    'Rebuild the therapists from the appointments': 'Reconstruir los terapeutas a partir de las citas',

    // ----- appointment window -----
    'Edit Appointment': 'Editar cita', 'Time conflict — see below': 'Conflicto de horario — ver abajo',
    'Client Name *': 'Nombre del cliente *', 'Guest Type': 'Tipo de huésped', 'Hotel Guest': 'Huésped del hotel', 'Offsite Guest': 'Huésped externo',
    'Guest Room #': 'N.º de cuarto', '(for billing — leave blank to match by name)': '(para el cobro — déjalo vacío para buscar por nombre)', 'e.g. 22': 'ej. 22',
    "✦ Pre-Paid — included in the guest's package (WeTravel, some yoga retreats). Won't be charged to the room.": '✦ Prepagado — incluido en el paquete del huésped (WeTravel, algunos retiros de yoga). No se cargará al cuarto.',
    "Detected automatically — this guest's retreat package includes a massage.": 'Detectado automáticamente — el paquete de retiro de este huésped incluye un masaje.',
    'Service *': 'Servicio *', 'Therapist *': 'Terapeuta *', 'Date *': 'Fecha *', 'Start Time *': 'Hora de inicio *', 'Duration (min)': 'Duración (min)',
    'Payment Status': 'Estado de pago',
    "Billed to the guest's room automatically — paid when they settle at checkout.": 'Se carga automáticamente al cuarto del huésped — se paga al hacer el check-out.',
    'Original Details & Change History': 'Datos originales e historial de cambios',
    '📱 Send confirmation to therapist': '📱 Mandar confirmación al terapeuta', 'Delete Appointment': 'Eliminar cita', 'Save Appointment': 'Guardar cita',
    'Rate: not set — add a price in Services': 'Tarifa: sin definir — agrega un precio en Servicios',
    'Client:': 'Cliente:', 'Service:': 'Servicio:', 'Therapist:': 'Terapeuta:', 'Room:': 'Sala:', 'Date:': 'Fecha:', 'Start Time:': 'Hora de inicio:',
    'Duration:': 'Duración:', 'Payment Status:': 'Estado de pago:',    'Original Booking': 'Reserva original', 'No changes recorded since creation.': 'No hay cambios registrados desde que se creó.',
    'Please enter a client name.': 'Escribe el nombre del cliente.', 'Please select a service and therapist.': 'Selecciona un servicio y un terapeuta.',
    'Duration must be in 15-minute increments.': 'La duración debe ir en bloques de 15 minutos.',
    'Start time must be on a 15-minute boundary.': 'La hora de inicio debe caer en bloques de 15 minutos (:00, :15, :30, :45).',
    'Delete this appointment? This cannot be undone.': '¿Eliminar esta cita? No se puede deshacer.',
    'Requested': 'Solicitado', 'No request': 'Sin solicitud', '😊 Requested this therapist': '😊 Pidió a este terapeuta',
    '🤠 Requested a male therapist': '🤠 Pidió terapeuta hombre', '👗 Requested a female therapist': '👗 Pidió terapeuta mujer',
    'Requested this therapist': 'Pidió a este terapeuta', 'Requested a male therapist': 'Pidió terapeuta hombre', 'Requested a female therapist': 'Pidió terapeuta mujer',
    'Booked by:': 'Reservó:', 'not recorded (made before this was tracked)': 'no registrado (se hizo antes de que se guardara esto)',
    'Client booked online': 'El cliente reservó en línea',
    'Save the appointment first.': 'Primero guarda la cita.', 'Sending…': 'Enviando…', 'Connection problem — not sent.': 'Problema de conexión — no se envió.',

    // ----- balance advisor -----
    '⚖ Balance the services · Services look balanced': '⚖ Equilibrar los servicios · Los servicios se ven equilibrados',
    '▸ Show': '▸ Mostrar', '▾ Hide': '▾ Ocultar',
    '. You can offer it to:': '. Se lo puedes ofrecer a:', 'You can offer it to:': 'Se lo puedes ofrecer a:',
    'is with': 'está con',
    'Mayan Healing goes to Gaby and Maria Luisa first.': 'La sanación maya va primero con Gaby y Maria Luisa.',

    // ----- time blocks -----
    'Blocked': 'Bloqueado', '⛔ Blocked': '⛔ Bloqueado', 'All day': 'Todo el día',
    "The blocked hours show on the calendar and can't be booked on the guest booking page.": 'Las horas bloqueadas se ven en el calendario y no se pueden reservar en la página de reservas de huéspedes.',
    'Who': 'Quién', 'Everyone': 'Todos', 'To (optional)': 'Hasta (opcional)', 'Start': 'Inicio', 'End': 'Fin', 'Reason': 'Motivo',
    'e.g. Event, Staff meeting, Doctor': 'ej. Evento, Junta de staff, Doctor', 'Block': 'Bloquear',
    'Pick at least one therapist.': 'Elige al menos un terapeuta.', 'Pick a date.': 'Elige una fecha.', '"To" is before "From".': '"Hasta" es antes de "Desde".',
    'The end time must be after the start time.': 'La hora de fin debe ser después de la hora de inicio.', 'Block removed ✓': 'Bloqueo quitado ✓',

    // ----- Google Calendar -----
    'Connected ✓': 'Conectado ✓', '— your booked calls show in the calendar below as blue 📞 boxes.': '— tus llamadas agendadas se ven abajo en el calendario como cuadros azules 📞.',
    'Show the phone calls people book through your Google Calendar on this calendar.': 'Muestra en este calendario las llamadas que la gente agenda en tu Google Calendar.',
    'Get the link (on a computer):': 'Saca el link (en una computadora):', 'Google Calendar → gear →': 'Google Calendar → engrane →',
    '→ click your calendar on the left →': '→ clic en tu calendario a la izquierda →', 'Integrate calendar': 'Integrar el calendario', '→ copy': '→ copia',
    'Secret address in iCal format': 'Dirección secreta en formato iCal',
    '. It is read-only and kept hidden on the server, but treat it like a password.': '. Es de solo lectura y se guarda oculta en el servidor, pero trátala como una contraseña.',
    'Only show events whose title contains (optional)': 'Solo mostrar eventos cuyo título contenga (opcional)', 'Show them in the column of': 'Mostrarlos en la columna de',
    '•••••• (saved — paste a new one to replace it)': '•••••• (guardado — pega uno nuevo para reemplazarlo)', 'e.g. phone': 'ej. llamada',
    'Save and check': 'Guardar y revisar', 'Disconnect': 'Desconectar', 'Paste the link first.': 'Primero pega el link.',
    'To change the filter or column, paste the link again (it is not stored where this page can read it).': 'Para cambiar el filtro o la columna, pega el link otra vez (no se guarda donde esta página lo pueda leer).',
    'Checking the calendar…': 'Revisando el calendario…', 'That did not work.': 'No funcionó.', 'Network error — try again.': 'Error de red — intenta de nuevo.',
    'Disconnect your Google Calendar? The blue call boxes will disappear.': '¿Desconectar tu Google Calendar? Los cuadros azules de llamadas van a desaparecer.',
    'Google Calendar disconnected.': 'Google Calendar desconectado.',

    // ----- last-minute -----
    '⚡ Last-minute booking': '⚡ Reserva de último minuto', '🔔 Sound on': '🔔 Sonido activado', '🔕 Sound off': '🔕 Sonido apagado',
    'Click to open or close': 'Clic para abrir o cerrar',

    // ----- rule alerts -----
    '✓ Therapist authorized': '✓ El terapeuta autorizó', 'The therapist agreed to this. It moves to the authorized list.': 'El terapeuta estuvo de acuerdo. Pasa a la lista de autorizados.',
    'Authorized by the therapist': 'Autorizado por el terapeuta', 'Undo': 'Deshacer', 'Coming up:': 'Próximos:',
    'Click to open': 'Clic para abrir', 'Click to close': 'Clic para cerrar',

    // ----- who booked report -----
    'Spa: who booked': 'Spa: quién reservó', 'Counts the services by the day they were booked, and by who booked them.': 'Cuenta los servicios por el día en que se reservaron y por quién los reservó.',
    'Last 7 days': 'Últimos 7 días', 'booked': 'reservados', 'No services were booked in this period.': 'No se reservaron servicios en este periodo.',
    'Online (guest booking page)': 'En línea (página de reservas)', 'Not recorded (before names were saved)': 'No registrado (antes de que se guardaran los nombres)',

    // ----- day report -----
    'Day Report Access': 'Acceso al reporte del día',
    'This shows sales, profit and what each therapist is owed. Enter the payroll access code.': 'Aquí se ven las ventas, la ganancia y lo que se le debe a cada terapeuta. Escribe el código de acceso de nómina.',
    'Sales (booked)': 'Ventas (reservadas)', 'Sales (completed)': 'Ventas (completadas)', 'Therapist pay': 'Pago a terapeutas', 'Profit (completed)': 'Ganancia (completadas)',
    'after service costs & therapist pay': 'después de costos del servicio y pago a terapeutas',
    'Who to pay': 'A quién pagar', 'Copy for WhatsApp': 'Copiar para WhatsApp', 'No therapist assigned': 'Sin terapeuta asignado',
    'No confirmed or completed services on this day.': 'No hay servicios confirmados o completados este día.',
    'Copied — paste it into WhatsApp.': 'Copiado — pégalo en WhatsApp.', 'Copy this:': 'Copia esto:',
    '⚠ no therapist — pays $0': '⚠ sin terapeuta — paga $0', '⚠ no rate set — pays $0': '⚠ sin tarifa — paga $0', '⚠ no price on service — pays $0': '⚠ servicio sin precio — paga $0',

    // ----- reports -----
    'This week': 'Esta semana', 'This month': 'Este mes', 'Last month': 'Mes pasado', 'Last 30 days': 'Últimos 30 días', 'All time': 'Todo el tiempo',
    'or': 'o', '🖨 Print report': '🖨 Imprimir reporte', 'All dates': 'Todas las fechas',
    'Services done': 'Servicios hechos', 'Requested by name': 'Pedidos por nombre', 'Hours worked': 'Horas trabajadas', 'Hours': 'Horas',
    'Est. revenue (list price)': 'Ingreso est. (precio de lista)', 'Est. revenue': 'Ingreso est.', 'Cancelled / no-show': 'Cancelados / no se presentó',
    'Who is leading': 'Quién va adelante', 'Therapist (click for report)': 'Terapeuta (clic para ver su reporte)', 'Done': 'Hechos',
    '% requested': '% pedidos', 'Online-booked': 'Reservados en línea', 'By service': 'Por servicio',
    'Services done per week (week starting)': 'Servicios hechos por semana (inicio de semana)', 'Busiest days': 'Días con más trabajo',
    'Busiest start times': 'Horas de inicio con más trabajo', 'Nothing in this period.': 'Nada en este periodo.',
    'Mon': 'Lun', 'Tue': 'Mar', 'Wed': 'Mié', 'Thu': 'Jue', 'Fri': 'Vie', 'Sat': 'Sáb', 'Sun': 'Dom',

    // ----- not charged -----
    'Not Charged to a Room': 'Sin cargar a un cuarto',
    'Hotel Guest services that are Confirmed or Completed but never posted to a folio. Pre-Paid ones are left out.': 'Servicios de huéspedes del hotel Confirmados o Completados que nunca se cargaron a un folio. Los prepagados no aparecen.',
    'Include upcoming dates': 'Incluir fechas próximas', '↻ Check again': '↻ Revisar otra vez', 'Checking the room accounts…': 'Revisando las cuentas de los cuartos…',
    'services that looked uncharged are': 'servicios que parecían sin cargar', 'actually already charged': 'en realidad ya están cargados',
    "on the guest's room account (charged by hand before the appointment was updated), so they are not listed below.": 'en la cuenta del cuarto del huésped (se cargaron a mano antes de que se actualizara la cita), así que no aparecen abajo.',
    'really still needs charging.': 'de verdad falta por cargar.', 'really still need charging.': 'de verdad faltan por cargar.',
    'Why not charged': 'Por qué no se cargó', '🗑 Delete': '🗑 Eliminar',
    "Post this service to the guest's room account": 'Cargar este servicio a la cuenta del cuarto del huésped',
    "The guest can't be matched yet — this will tell you why. Fix the room or name with Edit first.": 'Todavía no se puede identificar al huésped — esto te dice por qué. Corrige el cuarto o el nombre con Editar primero.',
    'Nothing left to charge — everything listed above is already on a room account.': 'No queda nada por cargar — todo lo de arriba ya está en una cuenta de cuarto.',
    'Everything is charged. Nothing to fix.': 'Todo está cargado. No hay nada que arreglar.',
    'No room number on the appointment, and the name matches no guest': 'La cita no tiene número de cuarto y el nombre no coincide con ningún huésped',
    'Guest found, but the service has no price set': 'Se encontró al huésped, pero el servicio no tiene precio',
    'Appointment deleted.': 'Cita eliminada.', '(no name)': '(sin nombre)',

    // ----- rebuild wizard / recovery list -----
    'Rebuild the spa therapists': 'Reconstruir los terapeutas del spa',
    'Each person below is a therapist your appointments still point at. Use the guests and times to tell who is who, type their name, and pick male or female. Pay rates are not known: set them in Spa > Therapists afterwards. A copy of the current spa settings is saved first. If a database backup is restored later, it replaces all of this.': 'Cada persona de abajo es un terapeuta al que todavía apuntan tus citas. Usa los huéspedes y horarios para saber quién es quién, escribe su nombre y elige hombre o mujer. No se conocen las tarifas de pago: ponlas después en Spa > Terapeutas. Primero se guarda una copia de la configuración actual del spa. Si después se restaura un respaldo de la base de datos, reemplaza todo esto.',
    'Who is this? (name)': '¿Quién es? (nombre)', '(leave it)': '(dejarlo así)', 'None missing.': 'No falta ninguno.', 'Rebuild now': 'Reconstruir ahora',
    'Type at least one therapist name first.': 'Primero escribe al menos el nombre de un terapeuta.',
    'Spa therapists rebuilt. Set their services and pay rates in Spa > Therapists.': 'Terapeutas del spa reconstruidos. Pon sus servicios y tarifas de pago en Spa > Terapeutas.',
    'Your appointments are safe. Read-only list. Use the arrows above to change the day. Please do not add therapists by hand: the real ones are being restored.': 'Tus citas están a salvo. Lista de solo lectura. Usa las flechas de arriba para cambiar de día. Por favor no agregues terapeutas a mano: se están restaurando los reales.',
    'No appointments on this day.': 'No hay citas este día.', 'no therapist': 'sin terapeuta',

    // ----- spa-staff login -----
    'Spa Booking': 'Reservas del spa', 'Username': 'Usuario', 'Password': 'Contraseña', 'Sign In': 'Entrar', 'Sign Out': 'Cerrar sesión',
    'Need access? Contact': '¿Necesitas acceso? Escribe a', 'Sign out?': '¿Cerrar sesión?',
    'Please enter your username and password.': 'Escribe tu usuario y contraseña.', 'Checking credentials…': 'Revisando datos…',
    'Network error — please try again.': 'Error de red — intenta de nuevo.', 'Incorrect username or password.': 'Usuario o contraseña incorrectos.',
  });

  i18nAddRx([
    // dates on their own
    [/^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday), (January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2})$/, m => esDate(m)],
    [/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat), (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2})$/, m => esDate(m)],
    [/^Day Report · (.+)$/, (m, d) => `Reporte del día · ${esDate(d)}`],

    // dashboard / confirmations
    [/^averaged over (\d+) days$/, 'promedio de $1 días'],
    [/^of (\d+) registered guests staying in this window$/, 'de $1 huéspedes registrados hospedados en estas fechas'],
    [/^(\d+) of (\d+) confirmed$/, '$1 de $2 confirmados'],
    [/^(\d+) pending$/, '$1 pendientes'],
    [/^Charge this service to (.+)'s room folio$/, 'Cargar este servicio al folio del cuarto de $1'],
    [/^No guest in room (.+) matches "(.*)" — check the room number or charge manually\.$/, 'Ningún huésped del cuarto $1 coincide con "$2" — revisa el número de cuarto o cárgalo a mano.'],
    [/^Charge (.+)'s room folio (.+) for "(.*)"\?$/, '¿Cargar $2 al folio del cuarto de $1 por "$3"?'],
    [/^Could not charge (.+)'s folio — ([\s\S]*)\. Try "Charge to Room" again\.$/, 'No se pudo cargar al folio de $1 — $2. Intenta "Cargar al cuarto" otra vez.'],
    [/^Charged (\S+) to (.+)'s folio ✓$/, 'Se cargó $1 al folio de $2 ✓'],
    [/^Auto-charged (\S+) to (.+)'s room ✓$/, 'Se cargó automáticamente $1 al cuarto de $2 ✓'],

    // payroll
    [/^(\d+) tips?$/, (m, n) => `${n} ${pl(n, 'propina', 'propinas')}`],
    [/^Total tips: (.+)$/, 'Total de propinas: $1'],
    [/^(\d+) completed$/, '$1 completados'],
    [/^Total owed: (.+)$/, 'Total a pagar: $1'],
    [/^Showing: (.+)$/, (m, l) => 'Mostrando: ' + (l === 'All time' ? 'todo el tiempo' : l.replace(/^the beginning\b/, 'el inicio').replace(/ to /, ' a ').replace(/today and beyond$/, 'hoy en adelante'))],
    [/^(\d+) tips? with no date not included$/, (m, n) => `${n} ${pl(n, 'propina sin fecha no incluida', 'propinas sin fecha no incluidas')}`],

    // services / therapists
    [/^from (\$[\d,.]+)$/, 'desde $1'],
    [/^Deactivated \((\d+)\)$/, 'Desactivados ($1)'],
    [/^(\d+) services?$/, (m, n) => `${n} ${pl(n, 'servicio', 'servicios')}`],
    [/^★ (.+)'s default room$/, '★ Sala predeterminada de $1'],

    // calendar
    [/^(.+) · tap to unmute$/, '$1 · toca para reactivar'],
    [/^Mute (.+)$/, 'Silenciar a $1'],
    [/^Confirmed by (.+) — click to unconfirm$/, 'Confirmado por $1 — clic para quitar la confirmación'],
    [/^Can't move there — conflicts with (.+) at (.+)\.$/, 'No se puede mover ahí — choca con $1 a las $2.'],
    [/^Conflicts with (.+) at (.+?) — pick another time, therapist, or room\.$/, 'Choca con $1 a las $2 — elige otra hora, terapeuta o sala.'],
    [/^⚠ (.+) marked themselves unavailable on (\S+) in the Staff Confirmations portal — you can still book them if they've agreed to make an exception\.$/,
      '⚠ $1 se marcó como no disponible el $2 en el portal de Confirmaciones del staff — todavía puedes reservarle si aceptó hacer una excepción.'],
    [/^(.+) has this day off, per their Working Hours in Staff Confirmations — can't book them then\. Pick another time, or have them update their Working Hours in Staff Confirmations first\.$/,
      '$1 tiene este día libre según su Horario de trabajo en Confirmaciones del staff — no se le puede reservar. Elige otra hora, o pídele que primero actualice su Horario de trabajo en Confirmaciones del staff.'],
    [/^(.+) is only available (.+?) on this day of the week — can't book them outside that window\. Pick another time, or have them update their Working Hours in Staff Confirmations first\.$/,
      '$1 solo está disponible de $2 este día de la semana — no se le puede reservar fuera de ese horario. Elige otra hora, o pídele que primero actualice su Horario de trabajo en Confirmaciones del staff.'],
    // change history: 'Service changed from "a" to "b"; Date changed from ...'
    [/^[A-Z][A-Za-z ]+ changed from "[\s\S]*" to "[\s\S]*"$/, m => m.replace(/(^|; )([A-Z][A-Za-z ]+) changed from "/g, (x, p, l) => `${p}${FIELD[l] || l}: de "`).replace(/" to "/g, '" a "')],
    // who confirmed it (hover title on the calendar boxes)
    [/^(Confirmed by the therapist|Confirmed by staff|Confirmed)( \([^)]*\))?( on [A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2} [AP]M)?( — the therapist has not confirmed this themselves| — who confirmed it was not recorded)?$/,
      (m, a, by, on, tail) => ({ 'Confirmed by the therapist': 'Confirmado por el terapeuta', 'Confirmed by staff': 'Confirmado por el staff', 'Confirmed': 'Confirmado' }[a])
        + (by || '') + (on ? ' el ' + on.replace(/^ on ([A-Z][a-z]{2}) (\d{1,2}),/, (x, mo, d) => `${d} ${MON[mo] || mo},`) : '')
        + (tail ? (tail.includes('themselves') ? ' — el terapeuta no lo ha confirmado' : ' — no se registró quién lo confirmó') : '')],
    [/^Confirmation sent to (.+) by WhatsApp ✓$/, 'Confirmación enviada a $1 por WhatsApp ✓'],
    // Maria Luisa limits + therapist booking rules
    [/^(.+) already has (\d+) services that day, and her maximum is (\d+)\. Please choose another therapist or another day\.$/, '$1 ya tiene $2 servicios ese día y su máximo es $3. Elige otro terapeuta u otro día.'],
    [/^(.+) needs a (\d+)-minute break after her first (\d+) services \(she is free again at (.+)\)\. Please choose a later time or another therapist\.$/, '$1 necesita un descanso de $2 minutos después de sus primeros $3 servicios (vuelve a estar libre a las $4). Elige una hora más tarde u otro terapeuta.'],
    [/^[\s\S]+\n\nBook it anyway\?$/, m => m
      .replace(/(.+) already has (\d+) services? that day, and the maximum is (\d+)\./g, (x, t, n, mx) => `${t} ya tiene ${n} ${pl(n, 'servicio', 'servicios')} ese día y el máximo es ${mx}.`)
      .replace(/This leaves less than (\d+) minutes between (.+)'s services \((.+) at (.+)\)\./g, 'Esto deja menos de $1 minutos entre los servicios de $2 ($3 a las $4).')
      .replace(/\n\nBook it anyway\?$/, '\n\n¿Reservar de todos modos?')],

    // balance advisor
    [/^\((\d+) requested\)$/, '($1 pedidos)'],
    [/^· (.+) · (\d{1,2}:\d{2} [AP]M)(?: (👗 asked for a woman|🤠 asked for a man))? is with$/,
      (m, svc, t, req) => `· ${svc} · ${t}${req ? (req.startsWith('👗') ? ' 👗 pidió mujer' : ' 🤠 pidió hombre') : ''} está con`],
    [/^(.+) \((\d+) today\)$/, '$1 ($2 hoy)'],
    [/^⚖ Balance the services · (\d+) services? could be shared out$/, (m, n) => `⚖ Equilibrar los servicios · ${n} ${pl(n, 'servicio se podría repartir', 'servicios se podrían repartir')}`],
    [/^Services today \((\d+)\): a request for that therapist is never moved\. Advice only: nothing changes until you press a name\. It assumes the therapist is working that day \(a day off is a time block\)\.$/,
      'Servicios de hoy ($1): una solicitud de ese terapeuta nunca se mueve. Solo es un consejo: nada cambia hasta que presionas un nombre. Supone que el terapeuta trabaja ese día (un día libre es un bloqueo de horario).'],
    [/^Move (.+) \((.+), (\d{1,2}:\d{2} [AP]M)\) from (.+) to (.+)\?$/, '¿Mover a $1 ($2, $3) de $4 a $5?'],
    [/^Can't move: it clashes with (.+) at (.+)\.$/, 'No se puede mover: choca con $1 a las $2.'],
    [/^Moved to (.+)\.$/, 'Se movió a $1.'],

    // who booked
    [/^Booked (.+?)\. Click a name to see the services\.(?: (\d+) cancelled services? not counted\.)? Bookings made before names were saved \(before Oct 25\) show as "Not recorded"\.$/,
      (m, range, c) => `Reservados ${range.split(' to ').map(esDate).join(' a ')}. Haz clic en un nombre para ver los servicios.${c ? ` ${c} ${pl(c, 'servicio cancelado no se cuenta', 'servicios cancelados no se cuentan')}.` : ''} Las reservas hechas antes de que se guardaran los nombres (antes del 25 oct) aparecen como "No registrado".`],

    // day report
    [/^(\d+) services, USD$/, '$1 servicios, USD'],
    [/^(\S+) USD at (\d+) MXN\/USD$/, '$1 USD a $2 MXN/USD'],
    [/^(\d+) tips? \((.+) USD\)$/, (m, n, v) => `${n} ${pl(n, 'propina', 'propinas')} (${v} USD)`],
    [/^⚠ (\d+) more not yet marked done by the therapist \((.+)\) — they count once the therapist marks them \(or you mark them Completed on the calendar\)\.$/,
      '⚠ $1 más que el terapeuta todavía no marca como hechos ($2) — cuentan cuando el terapeuta los marque (o cuando tú los marques como Completados en el calendario).'],
    [/^If the (\d+) Confirmed services? still open get completed, profit becomes$/, (m, n) => `Si ${pl(n, 'el servicio Confirmado pendiente se completa', 'los ' + n + ' servicios Confirmados pendientes se completan')}, la ganancia queda en`],
    [/^Total to pay: (.+)$/, 'Total a pagar: $1'],

    // Google Calendar
    [/^(.+) \(from Google Calendar\)$/, '$1 (de Google Calendar)'],
    [/^Connected ✓ — found (\d+) events in the next 60 days(?:, (\d+) match “(.*)”)?\.$/,
      (m, n, k, f) => `Conectado ✓ — se encontraron ${n} eventos en los próximos 60 días${k ? `, ${k} coinciden con “${f}”` : ''}.`],

    // activity guides shown on the calendar
    [/^(Shaman|Fire keeper|Leading|Guide) for (.+), (.+)\. Busy: not available for treatments\.$/, (m, r, l, t) => `${ROLE[r]}: ${l}, ${t}. Ocupado: no disponible para tratamientos.`],
    [/^Busy: (shaman|fire keeper|leading|guide) for (.+), (.+)\.$/, (m, r, l, t) => `Ocupado: ${ROLE[r.charAt(0).toUpperCase() + r.slice(1)]} — ${l}, ${t}.`],
    [/^🧭 (Shaman|Fire keeper|Leading|Guide): (.+)$/, (m, r, l) => `🧭 ${ROLE[r]}: ${l}`],

    // last-minute
    [/^booked at .+, \d+ (?:hours|minutes) (?:after the start time|before the service)$/, m => lmText(m)],
    [/^Last-minute booking — (.+)$/, (m, l) => `Reserva de último minuto — ${lmText(l)}`],
    [/^⚡ (\d+) last-minute bookings? on this day$/, (m, n) => `⚡ ${n} ${pl(n, 'reserva de último minuto', 'reservas de último minuto')} este día`],

    // rule alerts
    [new RegExp('^⚠ (\\d+) auto-assign rules? to check on ' + DATE + '$'), (m, n, d) => `⚠ ${n} ${pl(n, 'regla', 'reglas')} de asignación por revisar el ${esDate(d)}`],
    [new RegExp('^✓ (\\d+) rule breaks? on ' + DATE + ', all authorized by the therapist$'), (m, n, d) => `✓ ${n} ${pl(n, 'regla rota', 'reglas rotas')} el ${esDate(d)}, todas autorizadas por el terapeuta`],
    [new RegExp('^No rules broken on ' + DATE + '$'), (m, d) => `No hay reglas rotas el ${esDate(d)}`],
    [/^· coming up: (.+)$/, (m, l) => '· próximos: ' + l.replace(new RegExp('(\\d+) on ' + DATE, 'g'), (x, n, d) => `${n} el ${esDate(d)}`)],
    [new RegExp('^' + DATE + ' — (\\d+) to check$'), (m, d, n) => `${esDate(d)} — ${n} por revisar`],
    [/^— noted by (.+), ([A-Z][a-z]{2}) (\d{1,2}), (.+)$/, (m, by, mo, d, t) => `— anotado por ${by}, ${d} ${MON[mo] || mo}, ${t}`],
    [/^(• )?(.+ (?:has \d+ services \(the limit is|is double-booked at|has no break: service|has only \d+ minutes between|gets (?:no break|only \d+ minutes) after) .+)$/, (m, b, s) => (b || '') + ruleText(s)],

    // time blocks
    [/^(.+) — click to remove$/, '$1 — clic para quitar'],
    [/^⛔ (.+?) is blocked (all day|.+?) on (\d{4}-\d{2}-\d{2})( \(.+\))? — you can still save if they have agreed to an exception\.$/,
      (m, w, t, d, r) => `⛔ ${w === 'This therapist' ? 'Este terapeuta' : w} tiene bloqueado ${t === 'all day' ? 'todo el día' : t} el ${d}${r || ''} — todavía puedes guardar si aceptó una excepción.`],
    [/^Blocked (\d+) slots? ✓(?: — (\d+) booked appointments? (?:is|are) inside it)?$/,
      (m, n, c) => `${n} ${pl(n, 'bloqueo creado', 'bloqueos creados')} ✓${c ? ` — ${c} ${pl(c, 'cita reservada queda', 'citas reservadas quedan')} dentro` : ''}`],
    [/^These bookings are inside the blocked time\. Move or cancel them if needed:(\n\n[\s\S]*)$/, 'Estas reservas quedan dentro del horario bloqueado. Muévelas o cancélalas si hace falta:$1'],
    [/^Remove this block \((.+), (all day|[^,]+)\)\?$/, (m, r, t) => `¿Quitar este bloqueo (${r === 'Blocked' ? 'Bloqueado' : r}, ${t === 'all day' ? 'todo el día' : t})?`],

    // not charged
    [/^Room (.+) has no guest — check the room number$/, 'El cuarto $1 no tiene huésped — revisa el número de cuarto'],
    [/^Room (.+) is (.+), which doesn't match "(.*)" — wrong room or name$/, 'En el cuarto $1 está $2, que no coincide con "$3" — cuarto o nombre equivocado'],
    [/^Delete this appointment\?\n\n([\s\S]*?)\n\nThis removes it from the calendar, the reports and payroll\. It does NOT remove any charge already on a room account\.\n\nIf the service really happened and was charged, use "Mark as…" instead, so the therapist is still paid\.$/,
      '¿Eliminar esta cita?\n\n$1\n\nSe quita del calendario, de los reportes y de la nómina. NO quita ningún cargo que ya esté en la cuenta de un cuarto.\n\nSi el servicio sí se hizo y se cobró, usa "Marcar como…" en su lugar, para que al terapeuta se le pague.'],
    [/^(\d+) services? · (\$\S+) not yet charged$/, (m, n, v) => `${n} ${pl(n, 'servicio', 'servicios')} · ${v} sin cargar`],
    [/^✓ (\d+) of (\d+)$/, '✓ $1 de $2'],
    [/^Last (\d+) days$/, 'Últimos $1 días'],
    [/^Show the (\d+) already charged$/, 'Ver los $1 ya cargados'],

    // reports
    [/^#(\d+) of (\d+)$/, '#$1 de $2'],
    [/^#(\d+) · (\d+)% of bookings$/, '#$1 · $2% de las reservas'],
    [/^(.+) · "Done" = completed, or its time has passed and it was not cancelled · "Requested" = the guest asked for that therapist by name when booking online\.$/,
      (m, r) => `${r === 'All dates' ? 'Todas las fechas' : r.split(' → ').map(esDate).join(' → ')} · "Hechos" = completados, o ya pasó su hora y no se cancelaron · "Pedidos" = el huésped pidió a ese terapeuta por nombre al reservar en línea.`],

    // rebuild wizard / recovery list
    [/^Therapist (\d+)$/, 'Terapeuta $1'],
    [/^Therapist (\d+) \(missing\)$/, 'Terapeuta $1 (falta)'],
    [/^(\d+) active services? \((\d+) in all\)$/, (m, a, n) => `${a} ${pl(a, 'servicio activo', 'servicios activos')} (${n} en total)`],
    [/^(\d+) appointments?, usually (\d+) min →$/, (m, n, d) => `${n} ${pl(n, 'cita', 'citas')}, normalmente ${d} min →`],
    [/^Room (\d+): (\d+) appointments? →$/, (m, r, n) => `Sala ${r}: ${n} ${pl(n, 'cita', 'citas')} →`],
    [/^Therapists \((\d+)\)$/, 'Terapeutas ($1)'],
    [/^Rooms \((\d+)\)$/, 'Salas ($1)'],
    [/^Services the appointments use \((\d+)\): pick which service each one was$/, 'Servicios que usan las citas ($1): elige qué servicio era cada uno'],
    [/^Rebuild (\d+) therapists?(?: \((\d+) left unnamed\))?, (\d+) services? and (\d+) rooms?\?\n\nA copy of the current spa settings is saved first\.$/,
      (m, t, u, s, r) => `¿Reconstruir ${t} ${pl(t, 'terapeuta', 'terapeutas')}${u ? ` (${u} sin nombre)` : ''}, ${s} ${pl(s, 'servicio', 'servicios')} y ${r} ${pl(r, 'sala', 'salas')}?\n\nPrimero se guarda una copia de la configuración actual del spa.`],
    [/^Could not rebuild: (.*)$/, 'No se pudo reconstruir: $1'],
    [/^Could not save: (.*)$/, 'No se pudo guardar: $1'],
    [/^The therapist list is missing, so here are the appointments for this day \((\d+) active, (\d+) in all\)$/, 'Falta la lista de terapeutas, así que aquí están las citas de este día ($1 activas, $2 en total)'],
  ]);
})();
