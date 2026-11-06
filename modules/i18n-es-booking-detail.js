// Spanish for Booking Detail and folios — see modules/i18n.js
// Covers modules/booking-detail.js (reservation header, Booking/Guest panels, Rate and Folios, payments, refunds,
// split stay, Stripe / save-card pop-ups) and the Transfer Folio modal in booking-hub.html. The check-in pop-up
// (modules/checkin-by.js) and the Check Out confirm are already in modules/i18n-es-reservations.js.
// Jorge 2026-11-06: charges, their categories and payment methods stay exactly as entered -- only the system's own
// labels are translated; folio item cells carry data-no-i18n (booking-detail.js).
i18nAdd({
  // ----- loading / header -----
  'Loading folio…': 'Cargando folio…',
  'Reservation not found': 'No se encontró la reservación',
  '← Back': '← Atrás',
  'Booking': 'Reservación',
  'Undo Check Out': 'Deshacer Check Out',
  'Split Stay': 'Dividir estancia',
  'Undo Split': 'Deshacer división',
  '📋 Log': '📋 Historial',
  '✕ Cancel Edit': '✕ Cancelar edición',
  '✏️ Edit': '✏️ Editar',
  '🔄 Re-sync Cloudbeds': '🔄 Volver a sincronizar Cloudbeds',
  '☁️ Sync Cloudbeds': '☁️ Sincronizar Cloudbeds',
  'In House': 'En casa',
  'Expected': 'Por llegar',

  // ----- Booking panel -----
  '📅 Booking': '📅 Reservación',
  'Period': 'Periodo',
  'Full Stay': 'Estancia completa',
  'Retreat': 'Retiro',
  "Open this retreat's Registration tab": 'Abrir la pestaña de Registro de este retiro',
  'Source': 'Origen',
  'this room': 'este cuarto',
  'Rate': 'Tarifa',
  'Guest Notes': 'Notas del huésped',
  'No room notes.': 'Sin notas del cuarto.',
  "Edited only in the retreat's Room List (Edit Guest → Room notes).": 'Solo se edita en la Lista de cuartos del retiro (Edit Guest → Room notes).',
  'Notes the guest submitted...': 'Notas que envió el huésped...',
  'Internal notes...': 'Notas internas...',
  'Internal Notes': 'Notas internas',
  'Staff-only notes...': 'Notas solo para el staff...',

  // ----- Guest panel -----
  '👤 Guest': '👤 Huésped',
  '👤 Guests': '👤 Huéspedes',
  'Adults': 'Adultos',
  'First Name': 'Nombre',
  'Last Name': 'Apellido',
  'Save Changes': 'Guardar cambios',
  'Balance Due': 'Saldo pendiente',
  'Balance Due — whole room': 'Saldo pendiente — todo el cuarto',
  'Update': 'Actualizar',
  '💳 Save Card': '💳 Guardar tarjeta',

  // ----- Rate and Folios -----
  '💳 Rate and Folios': '💳 Tarifa y folios',
  '+ Add Folio': '+ Agregar folio',
  'Rename this folio': 'Cambiar el nombre de este folio',
  'OPEN': 'ABIERTO',
  'CLOSED': 'CERRADO',
  'Send to Guest': 'Enviar al huésped',
  'Reopen': 'Reabrir',
  'Transfer': 'Transferir',
  'Move this whole folio -- charges and payments -- to a different reservation (e.g. an extra night booked separately)': 'Mover todo este folio -- cargos y pagos -- a otra reservación (ej. una noche extra reservada aparte)',
  'Description': 'Descripción',
  'Qty': 'Cant.',
  'Unit Price': 'Precio unitario',
  'Tax': 'Impuesto',
  'No charges yet.': 'Aún no hay cargos.',
  '+ Add manually': '+ Agregar manualmente',
  '+ Add': '+ Agregar',
  'Price': 'Precio',
  'Tax%': 'Impuesto %',
  'Move to…': 'Mover a…',
  'Move this charge to another folio of this reservation': 'Mover este cargo a otro folio de esta reservación',
  '↩ Refund': '↩ Reembolsar',
  'Refund this card payment through Stripe (full or partial)': 'Reembolsar este pago con tarjeta por Stripe (total o parcial)',

  // ----- payment row / Pay Full Balance -----
  'Pay Full Balance': 'Pagar saldo completo',
  'Amount': 'Monto',
  'Reference (optional)': 'Referencia (opcional)',
  'Record': 'Registrar',
  '💳 Charge Card on File': '💳 Cobrar tarjeta registrada',
  '💳 Charge Card': '💳 Cobrar con tarjeta',

  // ----- payment / charge toasts -----
  'Enter a valid amount': 'Escribe un monto válido',
  'No folio to record this payment against.': 'No hay folio donde registrar este pago.',
  'Payment recorded ✓': 'Pago registrado ✓',
  'Booking confirmation sent to the guest ✓': 'Confirmación de reservación enviada al huésped ✓',
  'Enter a description and price': 'Escribe una descripción y un precio',
  'This folio is closed — reopen it to add charges.': 'Este folio está cerrado — reábrelo para agregar cargos.',
  'Folio name:': 'Nombre del folio:',
  'Folio name': 'Nombre del folio',
  'Folio renamed ✓': 'Nombre del folio cambiado ✓',
  'That folio is closed — reopen it first.': 'Ese folio está cerrado — reábrelo primero.',
  'Charge moved ✓': 'Cargo movido ✓',
  'Remove this charge?': '¿Quitar este cargo?',
  'Folio reopened ✓': 'Folio reabierto ✓',
  'Delete this folio and all its charges?': '¿Eliminar este folio y todos sus cargos?',
  'Something went wrong.': 'Algo salió mal.',

  // ----- refund pop-up -----
  'Refund card payment': 'Reembolsar pago con tarjeta',
  'Amount to refund (USD)': 'Monto a reembolsar (USD)',
  'Reason': 'Motivo',
  'e.g. cancelled extra night': 'ej. noche extra cancelada',
  "The money goes back to the guest's card through Stripe and cannot be undone. The guest gets an email and a WhatsApp. If the refund is for a cancelled service, also remove or adjust its charge on the folio.": 'El dinero regresa a la tarjeta del huésped por Stripe y no se puede deshacer. El huésped recibe un correo y un WhatsApp. Si el reembolso es por un servicio cancelado, también quita o ajusta su cargo en el folio.',
  'Refund': 'Reembolsar',
  'Enter the amount to refund.': 'Escribe el monto a reembolsar.',
  'Write the reason.': 'Escribe el motivo.',
  'Refunding…': 'Reembolsando…',
  'The refund did not go through.': 'El reembolso no se realizó.',
  'Connection problem — check Stripe before trying again.': 'Problema de conexión — revisa Stripe antes de intentar de nuevo.',

  // ----- Transfer Folio -----
  'Transfer Folio': 'Transferir folio',
  'Search guest name or room…': 'Buscar nombre del huésped o cuarto…',
  'Type a guest name or room to search…': 'Escribe un nombre de huésped o cuarto para buscar…',
  'Type at least 2 characters…': 'Escribe al menos 2 caracteres…',
  'No matches': 'Sin resultados',
  'Moving': 'Moviendo',
  'Folio transferred ✓': 'Folio transferido ✓',

  // ----- Send to Guest -----
  'Guest link copied to clipboard!': '¡Liga del huésped copiada al portapapeles!',
  'Guest link copied!': '¡Liga del huésped copiada!',
  'No email or phone on file — link copied to clipboard.': 'No hay correo ni teléfono registrado — liga copiada al portapapeles.',
  'Not sent again — link copied to clipboard': 'No se volvió a enviar — liga copiada al portapapeles',
  'Send failed': 'Falló el envío',

  // ----- notes / stay actions -----
  "These notes are edited in the retreat's Room List.": 'Estas notas se editan en la Lista de cuartos del retiro.',
  'Notes saved ✓': 'Notas guardadas ✓',
  'Internal notes saved ✓': 'Notas internas guardadas ✓',
  'Undo check-out? The guest goes back to In House.': '¿Deshacer el Check Out? El huésped regresa a En casa.',
  'Check-out undone ✓ — back In House': 'Check Out deshecho ✓ — de vuelta En casa',
  'Reservation cancelled ✓': 'Reservación cancelada ✓',
  'Cancel this reservation? This action will mark the booking as cancelled.': '¿Cancelar esta reservación? Esta acción marcará la reservación como cancelada.',
  'This reservation is not part of a split.': 'Esta reservación no es parte de una división.',
  'Split undone ✓': 'División deshecha ✓',

  // ----- Split Stay pop-up -----
  'This stay is too short to split (needs at least 2 nights).': 'Esta estancia es muy corta para dividirla (necesita al menos 2 noches).',
  'Moves to a new room starting': 'Se cambia a un cuarto nuevo a partir del',
  'New room': 'Cuarto nuevo',
  'Split': 'Dividir',
  'Pick a date and a room.': 'Elige una fecha y un cuarto.',
  'The split date must fall strictly within the current stay.': 'La fecha de división debe quedar dentro de la estancia actual (no el primer ni el último día).',
  'Splitting…': 'Dividiendo…',

  // ----- Stripe card payment / save card -----
  'Credit Card Payment': 'Pago con tarjeta de crédito',
  'Loading payment form…': 'Cargando formulario de pago…',
  '🔒 Secured by Stripe': '🔒 Protegido por Stripe',
  'Payment setup failed': 'No se pudo preparar el pago',
  'Could not load payment form.': 'No se pudo cargar el formulario de pago.',
  'Processing…': 'Procesando…',
  'Payment did not return a confirmation id.': 'El pago no regresó un número de confirmación.',
  'Payment charged ✓': 'Pago cobrado ✓',
  'Payment error': 'Error en el pago',
  'Save Card on File': 'Guardar tarjeta registrada',
  'Loading form…': 'Cargando formulario…',
  'Save Card': 'Guardar tarjeta',
  'Could not load card form.': 'No se pudo cargar el formulario de tarjeta.',
});

i18nAddRx([
  // ----- loading errors -----
  [/^Could not load reservation: (.*)$/, 'No se pudo cargar la reservación: $1'],
  [/^Could not load folio: (.*)$/, 'No se pudo cargar el folio: $1'],

  // ----- Booking panel -----
  [/^\(1 night\)$/, '(1 noche)'],
  [/^\((\d+) nights\)$/, '($1 noches)'],
  [/^\((\d+) nights? total, across (\d+) rooms\)$/, (m, n, r) => `(${n} ${n === '1' ? 'noche' : 'noches'} en total, en ${r} cuartos)`],
  [/^until (.+) →$/, 'hasta $1 →'],
  [/^from ([A-Z][a-z]{2} \d{1,2}, \d{4})$/, 'desde $1'],
  [/^(\$-?[\d,]+\.\d{2})\/night$/, '$1/noche'],
  [/^Room Total\s+(\d+) × (.+)$/, 'Total del cuarto   $1 × $2'],
  [/^By guest: (.*)$/, 'Por huésped: $1'],
  [/^💳 (.+) on file$/, '💳 $1 registrada'],

  // ----- folio header -----
  [/^Total (\$-?[\d,]+\.\d{2})$/, 'Total $1'],
  [/^Balance (\$-?[\d,]+\.\d{2})$/, 'Saldo $1'],

  // ----- payments -----
  [/^Error recording payment: (.*)$/, 'Error al registrar el pago: $1'],
  [/^Payment received message sent to the guest — (\$-?[\d,]+\.\d{2}) still to pay$/, 'Mensaje de pago recibido enviado al huésped — faltan $1 por pagar'],
  [/^Move "([\s\S]*)" \((\$-?[\d,]+\.\d{2})\) from "([\s\S]*)" to "([\s\S]*)"\?$/, '¿Mover "$1" ($2) de "$3" a "$4"?'],

  // ----- refund pop-up -----
  [/^Paid (\$-?[\d,]+\.\d{2}) · already refunded (\$-?[\d,]+\.\d{2})$/, 'Pagado $1 · ya reembolsado $2'],
  [/^Paid (\$-?[\d,]+\.\d{2})$/, 'Pagado $1'],
  [/^Full \((\$-?[\d,]+\.\d{2})\)$/, 'Total ($1)'],
  [/^At most (\$-?[\d,]+\.\d{2})\.$/, 'Máximo $1.'],
  [/^Refund (\$-?[\d,]+\.\d{2}) to the guest's card\? This cannot be undone\.$/, '¿Reembolsar $1 a la tarjeta del huésped? Esto no se puede deshacer.'],
  [/^Refunded (\$-?[\d,]+\.\d{2}) ✓ — guest notified$/, 'Reembolsado $1 ✓ — se avisó al huésped'],

  // ----- Transfer Folio -----
  [/^— 1 charge, total (\$-?[\d,]+\.\d{2}) — to a different reservation\. Every charge and payment on it moves together\.$/, '— 1 cargo, total $1 — a otra reservación. Todos sus cargos y pagos se mueven juntos.'],
  [/^— (\d+) charges, total (\$-?[\d,]+\.\d{2}) — to a different reservation\. Every charge and payment on it moves together\.$/, '— $1 cargos, total $2 — a otra reservación. Todos sus cargos y pagos se mueven juntos.'],
  [/^Room (.+?) · (.+) · Booking Engine$/, 'Cuarto $1 · $2 · Motor de reservas'],
  [/^Room (.+?) · (.+) · Group$/, 'Cuarto $1 · $2 · Grupo'],
  [/^Room (.+?) · (.+ – .+ · .+)$/, 'Cuarto $1 · $2'],
  [/^Move this folio to ([\s\S]+) \(Room ([\s\S]+)\)\? All its charges and payments go with it\.$/, '¿Mover este folio a $1 (cuarto $2)? Todos sus cargos y pagos se van con él.'],

  // ----- Send to Guest -----
  [/^This payment link was already sent to ([\s\S]*) (\d+) min ago\. Send it again\?$/, 'Esta liga de pago ya se le envió a $1 hace $2 min. ¿Enviarla otra vez?'],
  [/^Could not send \(([\s\S]*)\) — link copied to clipboard$/, 'No se pudo enviar ($1) — liga copiada al portapapeles'],
  [/^([\s\S]+) — link also copied to clipboard$/, '$1 — la liga también se copió al portapapeles'],

  // ----- cancel / remove / undo split -----
  [/^Cancel this reservation — room (.*) \(([\s\S]*)\)\?\n\nStays on record as cancelled[\s\S]*$/, '¿Cancelar esta reservación — cuarto $1 ($2)?\n\nQueda registrada como cancelada (no se borra) — sale de Llegadas/En casa/Salidas y Transporte, pero la puedes encontrar después en Búsqueda avanzada.'],
  [/^Cancelled the reservation, but could not free the room: ([\s\S]*)$/, 'Se canceló la reservación, pero no se pudo liberar el cuarto: $1'],
  [/^Cancel this reservation\?$/, '¿Cancelar esta reservación?'],
  [/^Cancel ([\s\S]+) reservation\?$/, '¿Cancelar la reservación de $1?'],
  [/^Remove ([\s\S]+) from room ([\s\S]+)\?\n\nOnly this room's registration is removed — the rest of ([\s\S]+) is not touched\.$/, '¿Quitar a $1 del cuarto $2?\n\nSolo se quita el registro de este cuarto — el resto de $3 no se toca.'],
  [/^Removed from room (.+) ✓ — retreat not changed$/, 'Quitado del cuarto $1 ✓ — el retiro no cambió'],
  [/^Undo this split\?\n\nRooms? ([\s\S]+) will be removed, and room ([\s\S]+) will cover the whole stay again through ([\s\S]+)\.$/, '¿Deshacer esta división?\n\nSe quitará(n) el/los cuarto(s) $1, y el cuarto $2 vuelve a cubrir toda la estancia hasta el $3.'],

  // ----- Split Stay pop-up -----
  [/^([\s\S]+) — currently room (.+) \((.+)\)$/, '$1 — actualmente en el cuarto $2 ($3)'],
  [/^Room (.+) is already blocked by ([\s\S]+) for part of those dates\.$/, 'El cuarto $1 ya está bloqueado por $2 en parte de esas fechas.'],
  [/^Split ✓ — moves to (.+) on (.+)$/, 'Dividida ✓ — se cambia a $1 el $2'],

  // ----- Stripe card payment -----
  [/^Amount: (\$-?[\d,]+\.\d{2})$/, 'Monto: $1'],
  [/^Pay (\$-?[\d,]+\.\d{2})$/, 'Pagar $1'],
  [/^Charged but could not save: ([\s\S]*)$/, 'Se cobró pero no se pudo guardar: $1'],
]);
