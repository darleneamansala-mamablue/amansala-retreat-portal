-- folio_closed_guard.sql — a CLOSED folio takes no new charges (Jorge 2026-11-06: "cuando el folio está cerrado no se
-- puedan hacer cargos, tiene que estar abierto"). Every screen and server job writes folio_items directly, so the rule
-- lives in the database: adding a charge (any line that is not a Payment / negative amount) to a closed folio, or moving
-- a charge into one, is refused with FOLIO_CLOSED. Payments and refunds can still be recorded on a closed folio (a guest
-- may pay a closed bill), and existing lines can still be edited or removed. Reopen the folio in Booking Detail to charge.
-- Run once in the Supabase SQL editor. Undo: drop trigger folio_closed_guard on folio_items; drop function folio_closed_guard();
create or replace function folio_closed_guard() returns trigger language plpgsql as $$
begin
  if coalesce(new.category, '') <> 'Payment' and coalesce(new.unit_price, 0) > 0
     and (tg_op = 'INSERT' or new.folio_id is distinct from old.folio_id)
     and exists (select 1 from folios f where f.id = new.folio_id and f.status <> 'open') then
    raise exception 'FOLIO_CLOSED: this folio is closed — reopen it in Booking Detail to add charges' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists folio_closed_guard on folio_items;
create trigger folio_closed_guard before insert or update of folio_id on folio_items
  for each row execute function folio_closed_guard();
