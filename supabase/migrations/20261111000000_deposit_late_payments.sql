-- Refundable deposits are marked "owed back" once, when the session ends
-- (run_tick step 4). A deposit confirmed after that (a host marking a cash
-- deposit paid after the game, or a late e-Transfer) was missed and never
-- showed up under Refunds -> Deposit. Now it's owed back as soon as it's paid.

create function public._owe_late_deposit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'confirmed' and new.paid_cents > 0 and not new.refund_owed
     and new.refunded_at is null and new.refund_waived_at is null
     and exists (
       select 1 from public.sessions s
        where s.id = new.session_id and s.deposit_cents is not null and s.deposits_released_at is not null
     ) then
    new.refund_owed := true;
  end if;
  return new;
end $$;

-- Only when a payment or status changes, so a host settling it by hand isn't undone.
create trigger registrations_owe_late_deposit
  before update of status, paid_cents on public.registrations
  for each row execute function public._owe_late_deposit();

revoke execute on function public._owe_late_deposit() from public, anon, authenticated;

-- Anything already missed.
update public.registrations r
   set refund_owed = true
  from public.sessions s
 where s.id = r.session_id
   and s.deposit_cents is not null and s.deposits_released_at is not null
   and r.status = 'confirmed' and r.paid_cents > 0 and not r.refund_owed
   and r.refunded_at is null and r.refund_waived_at is null;
