'use strict';
// ask-jorge-kb.js — what the "Ask Jorge" assistant knows about the Amansala Portal (Jorge 2026-11-05). Plain text, kept
// short and practical: how staff do things, step by step, plus the house rules that are easy to get wrong. When a feature
// changes, update this text too.
module.exports = `
AMANSALA PORTAL — STAFF GUIDE (amansalaportal.com)

The portal is the source of truth for rooms, guests and money. Cloudbeds must match it (it is synced from the portal).

LEFT MENU (main screens)
- Dashboard, Sales Pipeline, Booking Engine, Reservations, Menu, Activities, Tours & Ceremonies, Daily Briefing, Daily Reports,
  Staffing Forecast, Staff Schedules, Daily Shalas, Venues, Rooms, Teachers, Teacher Profiles, Builder, Dates, Schedule,
  Transport, Spa, Reports, Settings (some screens only appear for some accounts).

RESERVATIONS (menu: Reservations)
- Tabs: Arrivals (pick a date; "Today"), In House, Departures, Advanced Search, AC 24hrs.
- Each row: Room, Room Type, Name (click it to open the reservation = Booking Detail), Check-in, Check-out, Rate/Night, Source,
  Balance (everything still owed on ALL of the guest's folios), Card on File, Notes (room notes + Internal notes), Action.
- Check In / Check Out buttons are on Arrivals / Departures (and inside the reservation).
- AC 24hrs: only guests in the hotel today with "A/C 24 horas" marked; "❄️ Quitar" removes the flag.

BOOKING DETAIL (open any guest's name)
- Header buttons: Back, Check In / Check Out, Cancel (cancels, does not delete), Split Stay (guest changes room mid-stay),
  Log (history), Edit, Re-sync Cloudbeds / Sync Cloudbeds, Delete, status.
- Edit: change name, email, phone, room and dates. Picking a room that is occupied offers to SWAP the two guests.
  RULE: the rate never moves when you change dates or room (it is frozen).
  RULE: for a RETREAT guest, changing dates from here does NOT change the retreat's (teacher's) bill — extra nights must be
  charged on the guest's own folio. Extra nights that should go on the teacher's bill are added from the retreat's Room List
  (Edit Guest), not from here.
- Notes: for a retreat guest these are the Room notes and can only be edited in the retreat's Room List (Edit Guest).
  Internal Notes: staff-only, editable here.
- A/C: checkbox "24 horas (no apagar)".
- RATE AND FOLIOS: every folio of the room. "+ Add Folio" for a separate bill.
  - Add a charge: "+ Add manually" (pick from the item list or type description, category, qty, price, tax %) → "+ Add".
  - Edit / ✕ on each line (open folios only). "Move to…" moves a line to another folio of the same reservation.
  - Pencil next to the folio name renames it.
  - Record a payment: in the Payment row choose the method (Cash, Zelle, Venmo, Paypal, Bank Transfer, Clip, Credit Card (Stripe),
    Card on File, Expedia Collect), amount, optional reference → Record.
  - Credit Card (Stripe) opens a card form to charge the card now. "Save Card" keeps a card on file for later charges.
  - "Send to Guest" sends the guest a payment link for that folio (email + WhatsApp).
  - Close locks a folio (no more charges). Transfer moves the whole folio (charges + payments) to another reservation.
  - ↩ Refund appears on card payments made through Stripe; only Jorge, Hilario and Melissa can refund (full or partial, with a
    reason). The guest gets an email + WhatsApp. If the refund is for a cancelled service, also remove/adjust that charge.
- Balance Due = sum of all the guest's folios.

ROOMS (menu: Rooms) — room calendar
- Move a guest to another room: drag the bar to the new room row on the calendar, or open the reservation → Edit → Room.
  The rate is kept. Same-category swaps are free.
- New booking (Room Only / Walk-in / Direct / OTA): click an empty day on a room → fill guest, dates, type, rate, number of guests
  → save. It is created in Cloudbeds automatically and linked. If the guest has email/phone, they get a payment link
  (pay first): 6 days to pay, a reminder every morning, and the booking confirmation goes out when it is paid in full.
- Do NOT create a fake room reservation just to send a deposit link for a retreat: record retreat deposits in the retreat's
  Payments instead (ask Jorge if unsure).

RETREATS / ROOM LIST
- A retreat's Room List shows every room and guest; "Edit Guest" changes the guest's name, email, phone, room notes, check-in /
  check-out, rate overrides, nights billed, etc. Changes here DO count on the teacher's bill (including extra nights).
- Teachers can edit their own room list and contacts from the teacher portal unless the room or retreat is locked.
- Retreat payments (deposit, final payment) are recorded in the retreat's Payments (method: wire, cheque, zelle, venmo, card).
- Locking a room/retreat stops teachers from changing it.

RATES (where to see / change them)
- Booking Engine > Rates tab: "Base Rates" per room type — Escape rate, Extra Night High (Oct–Apr) and Extra Night Low (May–Sep),
  plus Pricing Rules (seasonal / weekend adjustments, Escape only). Extra Night defaults to the Escape rate when empty.
- The assistant can quote a price for given dates and room type (quote_room_rate): rate per night, taxes and total.
- A retreat's own room rates (what the teacher's bill uses) are in the retreat (Teachers / Room List); Edit Guest can set a
  custom rate or an extra-night rate for one guest.

EXTRA NIGHTS
- If the TEACHER pays the extra night for their guests: extend the guest's check-in / check-out in the retreat's Room List (Edit
  Guest). It is added to the teacher's bill (the guest's per-guest "extra night rate" can be set there).
- If the GUEST pays: make it a separate reservation (Rooms > New booking, Extra Night rate) or charge it on the guest's folio.
- A guest of a group retreat who adds nights right before/after the retreat gets the Extra Night rate (page extra-nights, or Lana
  on WhatsApp). A Room Only / Escape guest who extends pays the normal Escape rate.
- Extra nights paid in Cloudbeds or in the portal show "Extra night paid" in the reservation notes.

TRANSPORT (menu: Transport)
- Arrivals and departures with flight, time, airport, room, retreat, email, phone, notes and cost. Rides are grouped by time.
- To put guests in the same ride: drag a guest onto any row of the other ride. ⊗ takes a guest out of a ride.
- ✏️ edits a row (flight, dates, times, airport, own transport, pickup time). Both dates are required to save.
  Rows under "Missing Transport" are guests with no form yet; edit them to add their flight.
- The Room column always follows the retreat's room list.
- Upgrade mode shows Options (free same-category swaps) and Upgrade offers. Imprimir prints the driver sheet.

SPA (menu: Spa)
- Calendar of appointments by therapist / room. Click a slot to book; hotel guests are charged to their room folio
  automatically. Cancelling from the calendar does NOT remove the folio charge yet: remove it in the guest's folio.
- Guests can book themselves at amansalaportal.com/spa (Lana sends each guest a personal link with their name and room filled in).
- Settings for therapists, services and rooms are in Spa (Therapists / Services / Rooms tabs). Therapist pay rates per service
  are set in Spa > Therapists.

STAFF SCHEDULES (menu: Staff Schedules)
- Only Darlene, Irvin, Melissa and Jorge can upload or change schedules. Drop a photo/screenshot of the week and the portal reads
  it; click a day to change it (PSG, OFF, AM, PM, hours, custom). HR (Irvin) gets a WhatsApp when a schedule changes.

PAYMENTS FROM GUESTS — common cases
- Restaurant / bar consumption: added to the guest's folio (category Restaurant, 13% tax), or posted by Xetux automatically.
- Expedia Collect: Expedia charged the guest; record the payment with method "Expedia Collect".
- A reservation paid in Cloudbeds should not show a balance in the portal; if it does, ask Jorge.

SETTINGS
- Business rules (taxes, commission, transport prices, notifications) in Settings. Backup & Restore (Jorge only): daily full
  backup by email; restore from the file.

WHAT THE ASSISTANT CAN AND CANNOT DO
- It CAN do, after the person presses Confirm on its card: add a charge to a guest's folio, record a payment (Cash, Zelle, Venmo,
  Paypal, Bank Transfer, Clip, Expedia Collect), check a guest in or out, add an internal note, turn A/C 24h on/off, move a guest
  to another room (rate kept, Cloudbeds moved), book a spa service, create a Room Only reservation (created in Cloudbeds, the guest
  gets a payment link), send a folio's payment link to the guest.
- Since 2026-11-05 it ALSO does (after Confirm): remove or correct a charge, refund a Stripe card payment (only Jorge, Hilario,
  Melissa), cancel or move a spa appointment (the room charge goes / moves with it, the therapist gets a WhatsApp), send the
  therapist the confirmation, change a transport's date / time / airport / flight (its charge is re-priced), set a room clean /
  dirty / maintenance on the portal's Housekeeping board, and make a Cloudbeds reservation match the portal (dates, room).
  And it reviews: a stay's bill before check-out, extra nights (paid? who pays?), arrivals / departures of a day, the same
  guest twice or stays without a room, a therapist's agenda, portal vs Cloudbeds for one stay.
- Group leader in the Room List = the teacher star ★ on the leader's room (Room List > click the room > "Teacher room" box >
  Save; it is switched on by itself when a guest's name is the retreat's leader). Only one room per retreat. The reservation's
  leader name is in Booking Detail. Ask Jorge can mark it (teacher_room), and change the reservation's leader name (set_leader). Future retreats: find_guest needs the date of the
  retreat (e.g. 2027-03-08).
- Housekeeping: the portal's Housekeeping board status is what it changes. Cleaning tasks for the housekeepers are made in the
  Housekeeping app (supervisor > Refresh) — tell them to do that there.
- It CAN check a guest's folio against the spa calendar (stay_folios): every spa charge vs every spa appointment, and say which
  are real, which look duplicated, which have no appointment, which appointments have no charge, and which are after check-out.
  It reports; removing or moving a charge is done by staff in Booking Detail (or with its add_charge for a missing one).
- It does NOT charge a new card through Stripe, delete reservations or payments, or give discounts / comps: it explains how, or sends it to Jorge.
- Money decisions (refund approvals, discounts, comps, who pays an extra night), errors in the system, anything not covered
  here → it sends the question to Jorge.
`;
