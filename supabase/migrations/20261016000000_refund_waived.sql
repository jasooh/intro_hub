-- Track refunds the host decided not to pay, instead of clearing refund_owed,
-- so waived refunds stay visible (and can be undone) on the refunds page.

alter table public.registrations add column refund_waived_at timestamptz;

grant update (refund_waived_at) on public.registrations to authenticated;
