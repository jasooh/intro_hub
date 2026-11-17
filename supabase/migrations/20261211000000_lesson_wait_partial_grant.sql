-- A Full (Instructional + Drop-in) sign-up now gets its two resources
-- independently instead of as one atomic unit. If the drop-in spot is free
-- but the lesson is full, the sign-up still pays in full and holds the
-- drop-in spot right away, waiting on the lesson place in the background
-- (`lesson_queued_at`, set the moment it starts waiting and never reset by a
-- later promotion or switch). This only applies when the session prices
-- drop-in standalone (`dropin_price_cents is not null`) -- otherwise there's
-- no way to price a refund if the lesson place never opens, so a Full
-- sign-up stays fully atomic, exactly as before.

alter table public.registrations add column lesson_queued_at timestamptz;

-------------------------------------------------------------------------------
-- Fit predicates: the drop-in resource and the lesson resource, checked
-- independently. p_exclude leaves one sign-up out of the counts (the one
-- being granted or switched).
-------------------------------------------------------------------------------

-- Lesson places in use (full + instructional), minus any partial grant that
-- holds a drop-in spot but hasn't got a lesson place yet.
drop function public._instructional_used(uuid);
create function public._instructional_used(p_session_id uuid, p_exclude uuid default null) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.registrations
   where session_id = p_session_id
     and option in ('full', 'instructional')
     and status in ('pending_payment', 'confirmed')
     and lesson_queued_at is null
     and id is distinct from p_exclude;
$$;

create function public._dropin_fits(s public.sessions, p_exclude uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select count(*) from public.registrations
           where session_id = s.id and option in ('full', 'dropin')
             and status in ('pending_payment', 'confirmed')
             and id is distinct from p_exclude) < s.capacity;
$$;

create function public._lesson_fits(s public.sessions, p_exclude uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select s.instructional_capacity is null
     or public._instructional_used(s.id, p_exclude) < s.instructional_capacity;
$$;

-- Would this option fit right now? Now just the two predicates above, one per
-- resource the option needs.
create or replace function public._fits(s public.sessions, p_option text, p_exclude uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (p_option = 'instructional' or public._dropin_fits(s, p_exclude))
     and (p_option = 'dropin' or public._lesson_fits(s, p_exclude));
$$;

revoke execute on function public._instructional_used(uuid, uuid) from public, anon, authenticated;
revoke execute on function public._dropin_fits(public.sessions, uuid) from public, anon, authenticated;
revoke execute on function public._lesson_fits(public.sessions, uuid) from public, anon, authenticated;

-------------------------------------------------------------------------------
-- Counts: a partially-granted Full row holds a drop-in spot, not a lesson
-- place, so it no longer counts toward `lesson`.
-------------------------------------------------------------------------------
create or replace function public.get_session_counts(p_session_ids uuid[])
returns table (
  session_id uuid, confirmed int, holding int, waitlisted int, instructional int,
  instructional_waitlisted int, dropin int, lesson int
)
language sql stable security definer set search_path = '' as $$
  select s.id,
         (count(r.id) filter (where r.option in ('full', 'dropin') and r.status = 'confirmed'))::int,
         (count(r.id) filter (where r.option in ('full', 'dropin') and r.status = 'pending_payment'))::int,
         (count(r.id) filter (where r.option in ('full', 'dropin') and r.status = 'waitlisted'))::int,
         (count(r.id) filter (where r.option = 'instructional' and r.status in ('pending_payment', 'confirmed')))::int,
         -- The lesson queue is instructional-only waiters AND a Full row
         -- that holds its drop-in spot but is still waiting on the lesson.
         -- The status check on the Full side matters: without it, a
         -- cancelled/expired row that somehow still carries a stale
         -- lesson_queued_at would inflate this count forever.
         (count(r.id) filter (where (r.option = 'instructional' and r.status = 'waitlisted')
                                 or (r.option = 'full' and r.lesson_queued_at is not null
                                     and r.status in ('pending_payment', 'confirmed', 'waitlisted'))))::int,
         (count(r.id) filter (where r.option = 'dropin' and r.status in ('pending_payment', 'confirmed')))::int,
         (count(r.id) filter (where r.option in ('full', 'instructional') and r.status in ('pending_payment', 'confirmed')
                                 and r.lesson_queued_at is null))::int
    from public.sessions s
    left join public.registrations r on r.session_id = s.id
   where s.id = any (p_session_ids)
   group by s.id;
$$;

-------------------------------------------------------------------------------
-- Sign up: a Full sign-up can take the drop-in spot now and wait on the
-- lesson, when the session prices drop-in standalone. (Patched in place so
-- the long function isn't copied here.)
-------------------------------------------------------------------------------
do $$
declare
  v_def text := pg_get_functiondef('public.register_for_session(uuid, text, text)'::regprocedure);
  v_find_decl text := '  v_id uuid;
begin';
  v_find_grant text := '  v_amount := public._signup_price(s, p_option, false);
  if public._has_room(s, p_option) then
    v_status := case when v_amount = 0 then ''confirmed'' else ''pending_payment'' end;
  else
    v_status := ''waitlisted'';
  end if;';
  v_find_cols text := 'session_id, profile_id, status, ref_code, queued_at, hold_expires_at, confirmed_at, option, amount_cents, note';
  v_find_vals text := '    nullif(trim(p_note), '''')
  )';
  v_new text;
begin
  if (length(v_def) - length(replace(v_def, v_find_decl, ''))) / length(v_find_decl) <> 1 then
    raise exception 'register_for_session: declare block not found exactly once';
  end if;
  if (length(v_def) - length(replace(v_def, v_find_grant, ''))) / length(v_find_grant) <> 1 then
    raise exception 'register_for_session: grant decision not found exactly once';
  end if;
  if (length(v_def) - length(replace(v_def, v_find_cols, ''))) / length(v_find_cols) <> 1 then
    raise exception 'register_for_session: insert columns not found exactly once';
  end if;
  if (length(v_def) - length(replace(v_def, v_find_vals, ''))) / length(v_find_vals) <> 1 then
    raise exception 'register_for_session: insert values not found exactly once';
  end if;

  v_new := replace(v_def, v_find_decl, '  v_id uuid;
  v_dropin_ok boolean;
  v_lesson_ok boolean;
  v_lesson_queued_at timestamptz;
begin');

  v_new := replace(v_new, v_find_grant, '  v_amount := public._signup_price(s, p_option, false);
  if p_option = ''full'' then
    v_dropin_ok := public._dropin_fits(s, null);
    v_lesson_ok := public._lesson_fits(s, null);
    if v_dropin_ok and v_lesson_ok then
      v_status := case when v_amount = 0 then ''confirmed'' else ''pending_payment'' end;
      v_lesson_queued_at := null;
    elsif v_dropin_ok and s.dropin_price_cents is not null then
      v_status := case when v_amount = 0 then ''confirmed'' else ''pending_payment'' end;
      v_lesson_queued_at := now();
    else
      v_status := ''waitlisted'';
      -- Only track the lesson wait when a later partial grant is possible
      -- (dropin_price_cents is not null); otherwise this stays atomic
      -- exactly as before, with no lesson_queued_at for _promote to clear.
      if s.dropin_price_cents is not null then
        v_lesson_queued_at := now();
      end if;
    end if;
  elsif public._has_room(s, p_option) then
    v_status := case when v_amount = 0 then ''confirmed'' else ''pending_payment'' end;
  else
    v_status := ''waitlisted'';
  end if;');

  v_new := replace(v_new, v_find_cols,
    'session_id, profile_id, status, ref_code, queued_at, hold_expires_at, confirmed_at, option, amount_cents, note, lesson_queued_at');

  v_new := replace(v_new, v_find_vals, '    nullif(trim(p_note), ''''),
    v_lesson_queued_at
  )');

  execute v_new;
end $$;

-------------------------------------------------------------------------------
-- Switching option: the same independent drop-in/lesson split as the sign-up
-- path above, parameterized by the row being switched instead of a fresh
-- insert.
-------------------------------------------------------------------------------
create or replace function public.change_registration_option(p_registration_id uuid, p_option text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.registrations;
  s public.sessions;
  v_events jsonb := '[]';
  v_amount int;
  v_dropin_ok boolean;
  v_lesson_ok boolean;
  v_lesson_queued_at timestamptz;
begin
  if p_option not in ('full', 'instructional', 'dropin') then
    raise exception 'invalid_option';
  end if;
  select * into r from public.registrations where id = p_registration_id;
  if not found then
    raise exception 'registration_not_found';
  end if;
  if r.profile_id is distinct from auth.uid() then
    raise exception 'forbidden';
  end if;

  select * into s from public.sessions where id = r.session_id for update;
  select * into r from public.registrations where id = p_registration_id for update;

  if r.status not in ('pending_payment', 'waitlisted') then
    raise exception 'option_locked';
  end if;
  if r.option = p_option then
    return v_events;
  end if;
  if not public._option_offered(s, p_option) then
    raise exception 'option_unavailable';
  end if;

  v_amount := public._signup_price(s, p_option, r.friend_discount);

  v_dropin_ok := public._dropin_fits(s, r.id);
  v_lesson_ok := public._lesson_fits(s, r.id);

  v_lesson_queued_at := case
    when p_option <> 'full' then null
    when s.dropin_price_cents is null then null
    when v_dropin_ok and v_lesson_ok then null
    else coalesce(r.lesson_queued_at,
      case when r.option = 'instructional' and r.status = 'waitlisted' then r.queued_at else now() end)
  end;

  if (p_option in ('dropin', 'instructional') and public._fits(s, p_option, r.id))
     or (p_option = 'full' and v_dropin_ok and (v_lesson_ok or s.dropin_price_cents is not null)) then
    update public.registrations
       set option = p_option,
           amount_cents = v_amount,
           status = 'pending_payment',
           queued_at = null,
           hold_expires_at = case when r.status = 'pending_payment' and r.hold_expires_at is not null
                                  then r.hold_expires_at
                                  else least(now() + make_interval(hours => s.hold_hours), s.starts_at) end,
           lesson_queued_at = v_lesson_queued_at
     where id = r.id;
    if r.status = 'waitlisted' then
      v_events := v_events || jsonb_build_object('event', 'signed_up', 'registration_id', r.id);
    end if;
  elsif r.status = 'waitlisted' then
    update public.registrations
       set option = p_option, amount_cents = v_amount, lesson_queued_at = v_lesson_queued_at
     where id = r.id;
  else
    update public.registrations
       set option = p_option,
           amount_cents = v_amount,
           status = 'waitlisted',
           queued_at = now(),
           hold_expires_at = null,
           lesson_queued_at = v_lesson_queued_at
     where id = r.id;
    v_events := v_events || jsonb_build_object('event', 'waitlisted', 'registration_id', r.id);
  end if;

  -- Already paid enough for the new option (e.g. part-paid, then a cheaper one),
  -- or has credit from an earlier sign-up: confirmed.
  select * into r from public.registrations where id = r.id;
  if r.status = 'pending_payment' then
    if r.paid_cents > 0 and r.paid_cents >= r.amount_cents then
      v_events := v_events || public._reprice(r.id);
    elsif public._use_rejoin_credit(r.id) then
      v_events := v_events || jsonb_build_object('event', 'confirmed', 'registration_id', r.id);
    end if;
  end if;
  -- A spot (or lesson place) may have freed up with the option they left.
  return v_events || public._promote(s.id);
end $$;

-------------------------------------------------------------------------------
-- Promotion: the drop-in and lesson resources now fill independently, in two
-- separate FIFO passes, instead of one atomic loop.
--
-- The lesson pass promotes on lesson room alone, from a merged queue of:
--   * plain `instructional` waiters,
--   * partial-grant `full` rows (already holding their drop-in spot,
--     waiting on the lesson), and
--   * on an atomic session only (`dropin_price_cents is null`), a still-
--     waitlisted `full` row whose drop-in side also currently fits AND
--     which is the longest-waiting drop-in-resource seeker on the session
--     (no other waitlisted `dropin`/`full` row has an earlier `queued_at`):
--     both resources just freed together, so this is a full grant, not a
--     partial one.
-- Ordered by whichever clock each one actually uses: `lesson_queued_at` for
-- a `full` row that already has one, `queued_at` otherwise. Without that
-- atomic-only branch, a still-waitlisted atomic `full` row would be
-- invisible to this pass -- it's never granted a partial, drop-in-first
-- grant on an atomic session -- and a newer `instructional` waiter could
-- unfairly jump it for the lesson once both resources freed at once.
--
-- The longest-waiting-seeker check on that atomic-only branch isn't
-- optional: `dropin_price_cents is null` only means `dropin` isn't offered
-- going forward (`_option_offered`) -- it's not retroactive. A host can
-- null out `dropin_price_cents` on a session that already has a `dropin`
-- row waitlisted on it; that row doesn't get cancelled or converted. Were
-- it not for this check, a newer atomic `full` waiter could jump that
-- stale `dropin` row for the drop-in resource by going through the lesson
-- pass before the drop-in pass (which otherwise enforces this fairly on
-- its own) ever gets a turn.
--
-- The drop-in pass promotes on drop-in room alone, longest-waiting drop-in
-- waiter first, regardless of whether they're also stuck on the lesson -- a
-- `full` row stuck on the lesson must not be skipped in favor of a newer
-- `dropin` waiter. On a session with no standalone drop-in price, a `full`
-- row stays fully atomic (same as `register_for_session`'s "otherwise"
-- branch), so it's only a candidate once both resources fit.
--
-- The lesson pass runs FIRST, then the drop-in pass. Order matters: if the
-- drop-in pass ran first, a `full` waiter could be handed a full grant
-- (consuming the lesson place too) purely because both resources happened to
-- be free at that instant, jumping an `instructional` waiter (or, on a
-- session that offers a standalone drop-in price, a partial-grant `full`
-- row) who had been queued for the lesson longer. Running the lesson pass
-- first gives that longer-waiting lesson queue member the place before the
-- drop-in pass gets a chance to hand it to someone else as part of a full
-- grant; the drop-in pass then re-checks `_lesson_fits` and correctly falls
-- back to a partial grant (or, on an atomic session, leaves the row
-- waitlisted) once the lesson pass has already spoken for the place.
-------------------------------------------------------------------------------
create or replace function public._promote(p_session_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions;
  v_next public.registrations;
  v_events jsonb := '[]';
begin
  select * into s from public.sessions where id = p_session_id for update;
  if not found or s.status <> 'scheduled' or now() >= s.starts_at then
    return v_events;
  end if;

  -- Lesson pass (runs first): merged instructional + partial-grant-full
  -- queue, plus (atomic sessions only) a still-waitlisted full row.
  loop
    select w.* into v_next
      from public.registrations w
     where w.session_id = s.id
       and ((w.option = 'full' and w.status in ('pending_payment', 'confirmed') and w.lesson_queued_at is not null)
            or (w.option = 'instructional' and w.status = 'waitlisted')
            or (w.option = 'full' and w.status = 'waitlisted' and s.dropin_price_cents is null
                and public._dropin_fits(s, w.id)
                and not exists (
                  select 1 from public.registrations o
                   where o.session_id = s.id and o.status = 'waitlisted'
                     and o.option in ('dropin', 'full') and o.id <> w.id
                     and (o.queued_at, o.created_at) < (w.queued_at, w.created_at)
                )))
       and public._lesson_fits(s, w.id)
     order by coalesce(w.lesson_queued_at, w.queued_at)
     limit 1
     for update;
    exit when not found;

    if v_next.option = 'full' and v_next.status in ('pending_payment', 'confirmed') then
      -- Partial grant: already holds its drop-in spot; the lesson place
      -- just opened up. Reusing the 'confirmed' event here would collide
      -- with the dedupe key the row's original confirmation email already
      -- claimed (or will claim), so this gets its own event kind.
      update public.registrations set lesson_queued_at = null where id = v_next.id;
      v_events := v_events || jsonb_build_object('event', 'lesson_confirmed', 'registration_id', v_next.id);
    elsif v_next.option = 'full' then
      -- Still waitlisted (only reachable on an atomic session, per the
      -- candidate guard above): both resources just freed together, a full
      -- grant.
      if v_next.amount_cents = 0 then
        update public.registrations
           set status = 'confirmed', confirmed_at = now(), queued_at = null, lesson_queued_at = null
         where id = v_next.id;
        v_events := v_events || jsonb_build_object('event', 'confirmed', 'registration_id', v_next.id);
      else
        update public.registrations
           set status = 'pending_payment',
               queued_at = null,
               hold_expires_at = least(now() + make_interval(hours => s.hold_hours), s.starts_at),
               lesson_queued_at = null
         where id = v_next.id;
        v_events := v_events || jsonb_build_object(
          'event',
          case when public._use_rejoin_credit(v_next.id) then 'confirmed' else 'promoted' end,
          'registration_id',
          v_next.id
        );
      end if;
    elsif v_next.amount_cents = 0 then
      update public.registrations
         set status = 'confirmed', confirmed_at = now(), queued_at = null
       where id = v_next.id;
      v_events := v_events || jsonb_build_object('event', 'confirmed', 'registration_id', v_next.id);
    else
      update public.registrations
         set status = 'pending_payment',
             queued_at = null,
             hold_expires_at = least(now() + make_interval(hours => s.hold_hours), s.starts_at)
       where id = v_next.id;
      v_events := v_events || jsonb_build_object(
        'event',
        case when public._use_rejoin_credit(v_next.id) then 'confirmed' else 'promoted' end,
        'registration_id',
        v_next.id
      );
    end if;
    -- A friend who just got a spot brings the regular's discount with them.
    if v_next.brought_by is not null then
      v_events := v_events || public._claim_regular(v_next.brought_by);
    end if;
  end loop;

  -- Drop-in pass (runs second): longest-waiting drop-in (or full) waiter first.
  loop
    select w.* into v_next
      from public.registrations w
     where w.session_id = s.id and w.status = 'waitlisted'
       and w.option in ('full', 'dropin')
       and public._dropin_fits(s, w.id)
       and (w.option = 'dropin' or s.dropin_price_cents is not null or public._lesson_fits(s, w.id))
     order by w.queued_at, w.created_at
     limit 1
     for update;
    exit when not found;

    if v_next.option = 'full' and not public._lesson_fits(s, v_next.id) then
      -- Partial grant: the drop-in spot is free, the lesson isn't. Keep
      -- lesson_queued_at: normally it already carries this row's original
      -- lesson wait, but fall back to queued_at (or now(), last resort) in
      -- case it somehow arrives here null -- defense in depth, since a null
      -- clock here would make this row invisible to the lesson pass above.
      if v_next.amount_cents = 0 then
        update public.registrations
           set status = 'confirmed', confirmed_at = now(), queued_at = null,
               lesson_queued_at = coalesce(v_next.lesson_queued_at, v_next.queued_at, now())
         where id = v_next.id;
        v_events := v_events || jsonb_build_object('event', 'confirmed', 'registration_id', v_next.id);
      else
        update public.registrations
           set status = 'pending_payment',
               queued_at = null,
               hold_expires_at = least(now() + make_interval(hours => s.hold_hours), s.starts_at),
               lesson_queued_at = coalesce(v_next.lesson_queued_at, v_next.queued_at, now())
         where id = v_next.id;
        v_events := v_events || jsonb_build_object(
          'event',
          case when public._use_rejoin_credit(v_next.id) then 'confirmed' else 'promoted' end,
          'registration_id',
          v_next.id
        );
      end if;
    else
      -- Full grant: both resources fit (atomic `full`, or a `dropin` row).
      if v_next.amount_cents = 0 then
        update public.registrations
           set status = 'confirmed', confirmed_at = now(), queued_at = null, lesson_queued_at = null
         where id = v_next.id;
        v_events := v_events || jsonb_build_object('event', 'confirmed', 'registration_id', v_next.id);
      else
        update public.registrations
           set status = 'pending_payment',
               queued_at = null,
               hold_expires_at = least(now() + make_interval(hours => s.hold_hours), s.starts_at),
               lesson_queued_at = null
         where id = v_next.id;
        v_events := v_events || jsonb_build_object(
          'event',
          case when public._use_rejoin_credit(v_next.id) then 'confirmed' else 'promoted' end,
          'registration_id',
          v_next.id
        );
      end if;
    end if;
    -- A friend who just got a spot brings the regular's discount with them.
    if v_next.brought_by is not null then
      v_events := v_events || public._claim_regular(v_next.brought_by);
    end if;
  end loop;

  return v_events;
end $$;

-------------------------------------------------------------------------------
-- Lowering the lesson cap only claws back the lesson place from an unpaid
-- Full row, never the drop-in spot: it keeps the drop-in spot and just goes
-- back to waiting on the lesson, same as any other partial grant. (Only when
-- the session offers a standalone drop-in price -- otherwise there's no
-- partial state to demote into, same reasoning as every other partial-grant
-- guard in this migration.) A plain Instructional row has no drop-in spot to
-- keep, so it's still demoted fully waitlisted, same as today; so is a Full
-- row on a session with no drop-in price.
-------------------------------------------------------------------------------
create or replace function public._bump_overflow(p_session_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions;
  v public.registrations;
  v_first timestamptz;
  v_events jsonb := '[]';
  v_lesson boolean;
  v_options text[];
begin
  select * into s from public.sessions where id = p_session_id;
  if not found then
    return v_events;
  end if;

  foreach v_lesson in array array[false, true] loop
    v_options := case when v_lesson then array['full', 'instructional'] else array['full', 'dropin'] end;
    loop
      if v_lesson then
        exit when s.instructional_capacity is null
              or public._instructional_used(s.id) <= s.instructional_capacity;
      else
        exit when public._spots_used(s.id) <= s.capacity;
      end if;

      -- Who goes: unpaid before part-paid, people who signed up themselves
      -- before ones a host added (no hold), newest first. An already-partial
      -- Full row (lesson_queued_at already set) doesn't hold a lesson place
      -- to give up, so it's not a lesson-pass candidate here -- picking it
      -- again would reset its wait clock for no capacity gain, and silently
      -- skip past the row that's actually still holding the lesson place.
      select * into v
        from public.registrations
       where session_id = s.id and status = 'pending_payment'
         and option = any (v_options)
         and (not v_lesson or lesson_queued_at is null)
       order by (paid_cents > 0), (hold_expires_at is null), created_at desc
       limit 1
       for update;
      exit when not found;

      if v_lesson and v.option = 'full' and s.dropin_price_cents is not null then
        -- Partial demotion: keeps the drop-in spot (status, hold_expires_at,
        -- queued_at all untouched), just starts waiting on the lesson. The
        -- selection guard above means this row's lesson_queued_at is always
        -- null here, so this is genuinely a fresh wait, not a reset. It still
        -- holds its spot, so the referring regular's friend rate (if any)
        -- isn't released -- that's only for a row that's actually losing its
        -- spot, in the branch below.
        update public.registrations set lesson_queued_at = now() where id = v.id;
        v_events := v_events || jsonb_build_object('event', 'waitlisted', 'registration_id', v.id);
      else
        select min(queued_at) into v_first
          from public.registrations
         where session_id = s.id and status = 'waitlisted'
           and option = any (v_options);

        update public.registrations
           set status = 'waitlisted',
               hold_expires_at = null,
               queued_at = coalesce(v_first - interval '1 second', now())
         where id = v.id;
        v_events := v_events || jsonb_build_object('event', 'waitlisted', 'registration_id', v.id);
        if v.brought_by is not null then
          v_events := v_events || public._release_regular(v.brought_by);
        end if;
      end if;
    end loop;
  end loop;

  return v_events;
end $$;

-------------------------------------------------------------------------------
-- The host roster's waitlist position now also covers the merged lesson
-- queue: a plain Instructional waiter and a Full row that holds its
-- drop-in spot but is still waiting on the lesson share one numbering
-- sequence, ordered the same way _promote's lesson pass picks the next one.
-------------------------------------------------------------------------------
create or replace function public.get_session_attendees(p_session_id uuid)
returns table (
  registration_id uuid,
  display_name text,
  avatar_url text,
  status public.registration_status,
  option text,
  team_id uuid,
  waitlist_position int,
  is_me boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    return;
  end if;
  return query
    select r.id,
           coalesce(p.display_name, p.full_name, 'Player'),
           p.avatar_url,
           r.status,
           r.option,
           case when s.teams_published_at is not null then r.team_id end,
           case when r.status = 'waitlisted' and r.option <> 'instructional'
                then (row_number() over (partition by r.status, r.option = 'instructional'
                                         order by r.queued_at, r.created_at))::int
                when (r.option = 'instructional' and r.status = 'waitlisted')
                     or (r.option = 'full' and r.lesson_queued_at is not null)
                then (row_number() over (
                        partition by ((r.option = 'instructional' and r.status = 'waitlisted')
                                       or (r.option = 'full' and r.lesson_queued_at is not null))
                        order by coalesce(r.lesson_queued_at, r.queued_at)
                      ))::int
           end,
           r.profile_id = auth.uid()
      from public.registrations r
      join public.profiles p on p.id = r.profile_id
      join public.sessions s on s.id = r.session_id
     where r.session_id = p_session_id
       and r.status in ('pending_payment', 'confirmed', 'waitlisted')
     order by r.status, coalesce(r.confirmed_at, r.queued_at, r.created_at);
end $$;

-------------------------------------------------------------------------------
-- Cancelling a Full row that still carries a lesson wait (partial grant or
-- fully waitlisted) must drop it out of the lesson queue too -- otherwise it
-- leaves a phantom lesson_queued_at entry other waiters queue behind, and
-- inflates get_session_counts.instructional_waitlisted forever.
-------------------------------------------------------------------------------
create or replace function public.cancel_registration(p_registration_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.registrations;
  s public.sessions;
begin
  select * into r from public.registrations where id = p_registration_id;
  if not found then
    raise exception 'registration_not_found';
  end if;
  if r.profile_id is distinct from auth.uid() and not public.is_admin() then
    raise exception 'forbidden';
  end if;

  select * into s from public.sessions where id = r.session_id for update;
  select * into r from public.registrations where id = p_registration_id for update;

  if r.status not in ('pending_payment', 'confirmed', 'waitlisted') then
    return '[]'::jsonb;
  end if;
  if now() >= s.ends_at and not public.is_admin() then
    raise exception 'session_over';
  end if;

  update public.registrations
     set status = 'cancelled',
         cancelled_at = now(),
         queued_at = null,
         hold_expires_at = null,
         lesson_queued_at = null,
         refund_owed = (r.paid_cents > 0 and (now() < s.cancel_cutoff or public.is_admin()))
   where id = r.id;

  -- A friend who cancels takes the regular's discount with them (unless another
  -- friend still came with the regular, or the regular has already paid).
  return public._promote(s.id)
      || case when r.brought_by is not null then public._release_regular(r.brought_by) else '[]'::jsonb end;
end $$;

-------------------------------------------------------------------------------
-- run_tick: an expiring hold on a partial-grant Full row must clear its
-- lesson wait too (same phantom-entry reasoning as cancel_registration
-- above), and a Full sign-up still waiting on a lesson place once its
-- session is over gets the instructional portion of what it paid refunded
-- -- it only ever used the drop-in spot. (Patched in place.)
-------------------------------------------------------------------------------
do $$
declare
  v_def text := pg_get_functiondef('public.run_tick()'::regprocedure);
  v_find_expire text := '         set status = ''expired'', hold_expires_at = null, refund_owed = (paid_cents > 0)';
  -- Anchors on the hold-reminder loop's own update, not a step-number
  -- comment: the comments in the repo's reconstructed function text aren't
  -- reliably present on a live database (verified they're missing on dev),
  -- so this patch can't depend on them.
  v_find_anchor text := '  for r in
    update public.registrations reg
       set hold_nudged_at = v_now';
  v_new text;
begin
  if (length(v_def) - length(replace(v_def, v_find_expire, ''))) / length(v_find_expire) <> 1 then
    raise exception 'run_tick: hold-expiry update not found exactly once';
  end if;
  if (length(v_def) - length(replace(v_def, v_find_anchor, ''))) / length(v_find_anchor) <> 1 then
    raise exception 'run_tick: hold-reminder anchor not found exactly once';
  end if;

  v_new := replace(v_def,
    v_find_expire,
    '         set status = ''expired'', hold_expires_at = null, lesson_queued_at = null, refund_owed = (paid_cents > 0)');

  v_new := replace(v_new, v_find_anchor,
    '  -- 5a. Full sign-ups still waiting on a lesson place once the session is
  --     over: refund the instructional portion -- they only used the
  --     drop-in spot. Naturally idempotent: clearing lesson_queued_at here
  --     means a second run finds no matching rows.
  update public.registrations reg
     set amount_cents = s.dropin_price_cents,
         refund_owed = (reg.paid_cents > s.dropin_price_cents),
         lesson_queued_at = null
    from public.sessions s
   where reg.session_id = s.id
     and s.ends_at < v_now
     and reg.lesson_queued_at is not null
     and reg.status = ''confirmed'';

' || v_find_anchor);

  execute v_new;
end $$;
