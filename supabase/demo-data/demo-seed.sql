-- Demo data for showing the app to the host. DEV PROJECT ONLY (intro-hub-dev).
-- Never run this on production: it refuses unless the dev cron job exists.
--
-- Run in the dev project's SQL editor (or execute_sql). Undo with
-- demo-clean.sql, which removes only what this script added. To refresh the
-- demo (holds are real and run out after 12 hours), run demo-clean.sql and
-- then this file again shortly before showing it.
--
-- Everything goes through the app's own functions (register_for_session,
-- change_registration_option, set_team_requests, set_brought_by,
-- ingest_apply_payment, admin_mark_paid, cancel_registration, run_tick), called
-- as the relevant player or host by setting the JWT claims, so every row is in
-- a state the app can produce. Timestamps are then moved back so sign-ups look
-- like they happened over the past days.
--
-- What it makes (dates relative to today):
--   * 26 players (emails @demo.intro2volleyball.test, which can't receive mail;
--     announcement emails off).
--   * Session A = the weekly template's next session: full, 3 on the waitlist,
--     3 instructional-only (one switched from drop-in), two team-request groups
--     (3 and 2), a Bring a Friend pair at half price, paid / unpaid / one hold
--     running out in about an hour / one partial payment.
--   * Session B = the week after: about half full, mostly unpaid.
--   * Session C = a past Saturday: everyone paid, teams balanced and published,
--     game schedule, one cancelled spot already refunded.
--   * Session D = a past Sunday clinic with a refundable deposit: deposits owed
--     back (Refunds -> Deposit), two already refunded, one cancelled spot to refund.
--   * Payments inbox: e-transfers matched by ref code, one by name + amount,
--     one unmatched ("M CHEN") to assign live.
--   * Two published posts on the Updates board, the newer one featured.
--   * A weekly schedule template, only if there isn't an active one.
--
-- Tags (what demo-clean.sql looks for):
--   players   email like '%@demo.intro2volleyball.test'
--   sessions  id like 'de3a0000-0000-4000-a000-%' (or from the demo template)
--   posts / template  same id prefix
--   payments  gmail_message_id like 'demo-%', or linked to a demo sign-up
--   devtools_audit action 'demo_seed_adopt': settings of an existing session
--     this script changed (restored on clean-up)

begin;

-------------------------------------------------------------------------------
-- Guards
-------------------------------------------------------------------------------
do $$
begin
  if to_regclass('cron.job') is null
     or not exists (select 1 from cron.job where jobname = 'intro-hub-tick-dev')
     or exists (select 1 from cron.job where jobname = 'intro-hub-tick') then
    raise exception 'demo-seed: this does not look like the dev project (no intro-hub-tick-dev cron job). Not seeding.';
  end if;
  if exists (select 1 from public.profiles where email like '%@demo.intro2volleyball.test')
     or exists (select 1 from public.sessions where id::text like 'de3a0000-0000-4000-a000-%') then
    raise exception 'demo-seed: demo data is already there. Run demo-clean.sql first.';
  end if;
  if not exists (select 1 from public.profiles where role = 'admin') then
    raise exception 'demo-seed: needs at least one host (admin) account to act as.';
  end if;
  if coalesce((select (value ->> 'on')::boolean from public.app_settings where key = 'maintenance'), false) then
    raise exception 'demo-seed: maintenance mode is on; turn it off first.';
  end if;
end $$;

-------------------------------------------------------------------------------
-- Helpers (temporary: gone when this connection closes)
-------------------------------------------------------------------------------
-- Act as a signed-in user (null = no user) for the rest of the transaction.
create function pg_temp.act_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    case when p_uid is null then '' else json_build_object('sub', p_uid, 'role', 'authenticated')::text end, true);
$$;

create function pg_temp.pid(p_key text) returns uuid language sql stable as $$
  select id from public.profiles where email = p_key || '@demo.intro2volleyball.test';
$$;

create function pg_temp.admin_id() returns uuid language sql stable as $$
  select id from public.profiles where role = 'admin'
   order by (email like '%@demo.intro2volleyball.test'), created_at limit 1;
$$;

-- Sign a player up through register_for_session, then move the sign-up back to
-- p_at (hold deadline and queue position move with it).
create function pg_temp.signup(p_key text, p_session uuid, p_option text, p_at timestamptz, p_note text default null)
returns uuid language plpgsql as $$
declare
  v_uid uuid := pg_temp.pid(p_key);
  v_events jsonb;
  v_id uuid;
  v_shift interval := now() - p_at;
begin
  if v_uid is null then
    raise exception 'demo-seed: no demo player %', p_key;
  end if;
  perform pg_temp.act_as(v_uid);
  v_events := public.register_for_session(p_session, p_option, p_note);
  v_id := (v_events -> 0 ->> 'registration_id')::uuid;
  if v_id is null then
    raise exception 'demo-seed: sign-up for % returned no registration (%)', p_key, v_events;
  end if;
  update public.registrations
     set created_at = created_at - v_shift,
         queued_at = queued_at - v_shift,
         hold_expires_at = hold_expires_at - v_shift,
         confirmed_at = confirmed_at - v_shift
   where id = v_id;
  return v_id;
end $$;

-- An Interac e-Transfer as the Gmail ingest would store it. p_by 'ref' or
-- 'name_amount' links it with ingest_apply_payment (like /api/payments/ingest);
-- null leaves it unmatched with p_note as the reason.
create function pg_temp.etransfer(
  p_reg uuid, p_amount int, p_by text, p_at timestamptz,
  p_sender text default null, p_memo text default null, p_note text default null
) returns uuid language plpgsql as $$
declare
  r record;
  v_pid uuid;
  v_msg text := 'demo-' || replace(gen_random_uuid()::text, '-', '');
  v_sender text;
  v_memo text;
  v_amount int;
  v_result jsonb;
begin
  select g.*, p.first_name, p.last_name into r
    from public.registrations g join public.profiles p on p.id = g.profile_id
   where g.id = p_reg;
  v_sender := coalesce(p_sender, upper(r.first_name || ' ' || r.last_name));
  v_memo := case when p_by = 'ref' then coalesce(p_memo, r.ref_code) else p_memo end;
  v_amount := coalesce(p_amount, r.amount_cents - r.paid_cents);

  perform pg_temp.act_as(null);
  insert into public.payments (gmail_message_id, sender_name, amount_cents, memo, received_at, raw, note)
  values (
    v_msg, v_sender, v_amount, v_memo, p_at,
    jsonb_build_object('id', v_msg, 'senderName', v_sender, 'amountCents', v_amount, 'memo', v_memo,
                       'receivedAt', p_at, 'demo', true),
    case when p_by is null then p_note end
  )
  returning id into v_pid;

  if p_by is not null then
    v_result := public.ingest_apply_payment(v_pid, p_reg, p_by);
    if v_result is null then
      raise exception 'demo-seed: payment for % was not applied (sign-up not pending)', r.ref_code;
    end if;
    update public.payments set matched_at = p_at + interval '1 minute', created_at = p_at where id = v_pid;
    update public.registrations
       set confirmed_at = p_at + interval '1 minute'
     where id = p_reg and status = 'confirmed' and confirmed_at > p_at;
  else
    update public.payments set created_at = p_at where id = v_pid;
  end if;
  return v_pid;
end $$;

create function pg_temp.pay_ref(p_reg uuid, p_at timestamptz) returns void language sql as $$
  select pg_temp.etransfer(p_reg, null, 'ref', p_at);
$$;

-- A host pressing "Mark paid" (cash at the door, or a transfer they matched by eye).
create function pg_temp.mark_paid(p_reg uuid, p_at timestamptz) returns void language plpgsql as $$
begin
  perform pg_temp.act_as(pg_temp.admin_id());
  perform public.admin_mark_paid(p_reg);
  update public.payments
     set received_at = p_at, matched_at = p_at, created_at = p_at
   where registration_id = p_reg and matched_by = 'admin' and matched_at > now() - interval '1 minute';
  update public.registrations set confirmed_at = p_at where id = p_reg and status = 'confirmed';
  perform pg_temp.act_as(null);
end $$;

-------------------------------------------------------------------------------
-- Players
-------------------------------------------------------------------------------
create temp table demo_players (
  n int, key text, first_name text, last_name text, skill text, attended boolean,
  heard text, song text, goals text, joined_days int
) on commit drop;

insert into demo_players values
  ( 1, 'maya.tran',      'Maya',    'Tran',      'experienced', true,  'instagram',     'Eye of the Tiger – Survivor',                 'Cleaner overhand serve', 60),
  ( 2, 'daniel.okafor',  'Daniel',  'Okafor',    'experienced', true,  'word_of_mouth', 'Can''t Hold Us – Macklemore & Ryan Lewis',    'Hitting from the left side', 58),
  ( 3, 'priya.raman',    'Priya',   'Raman',     'some',        true,  'instagram',     'Dancing Queen – ABBA',                        'Getting comfortable setting', 55),
  ( 4, 'kevin.liu',      'Kevin',   'Liu',       'experienced', true,  'word_of_mouth', null,                                          null, 54),
  ( 5, 'sofia.martinez', 'Sofia',   'Martinez',  'some',        true,  'instagram',     'Titanium – David Guetta ft. Sia',             'Passing consistency', 50),
  ( 6, 'arjun.patel',    'Arjun',   'Patel',     'some',        true,  'word_of_mouth', null,                                          'Footwork', 49),
  ( 7, 'hannah.kim',     'Hannah',  'Kim',       'never',       true,  'javelin',       null,                                          'Learning the rules', 45),
  ( 8, 'marcus.brown',   'Marcus',  'Brown',     'experienced', true,  'word_of_mouth', 'Lose Yourself – Eminem',                      null, 44),
  ( 9, 'emily.chen',     'Emily',   'Chen',      'some',        true,  'instagram',     null,                                          'Serving overhand', 40),
  (10, 'jordan.lee',     'Jordan',  'Lee',       'some',        true,  'other',         null,                                          null, 38),
  (11, 'mei.chen',       'Mei',     'Chen',      'never',       true,  'instagram',     null,                                          'Just want to have fun and meet people', 35),
  (12, 'tyler.nguyen',   'Tyler',   'Nguyen',    'experienced', true,  'word_of_mouth', 'Thunderstruck – AC/DC',                       null, 33),
  (13, 'aisha.mohammed', 'Aisha',   'Mohammed',  'some',        true,  'instagram',     'Run the World (Girls) – Beyoncé',             'Blocking', 30),
  (14, 'ryan.oconnor',   'Ryan',    'O''Connor', 'some',        true,  'javelin',       null,                                          null, 28),
  (15, 'grace.wong',     'Grace',   'Wong',      'never',       false, 'word_of_mouth', null,                                          'Never played before, want to learn the basics', 2),
  (16, 'leo.ferreira',   'Leo',     'Ferreira',  'never',       false, 'instagram',     'September – Earth, Wind & Fire',              'Learn to bump and serve', 1),
  (17, 'nadia.haddad',   'Nadia',   'Haddad',    'never',       false, 'javelin',       null,                                          'Get some exercise and learn', 1),
  (18, 'chris.park',     'Chris',   'Park',      'prefer_not',  true,  'word_of_mouth', null,                                          null, 26),
  (19, 'olivia.smith',   'Olivia',  'Smith',     'some',        true,  'instagram',     'Shake It Off – Taylor Swift',                 null, 25),
  (20, 'ethan.wilson',   'Ethan',   'Wilson',    'experienced', true,  'word_of_mouth', null,                                          'Running a 5-1', 24),
  (21, 'zara.ali',       'Zara',    'Ali',       'prefer_not',  true,  'instagram',     null,                                          'Technique, not games yet', 22),
  (22, 'ben.thompson',   'Ben',     'Thompson',  'never',       true,  'other',         null,                                          null, 20),
  (23, 'isabel.rossi',   'Isabel',  'Rossi',     'some',        true,  'instagram',     'Mr. Brightside – The Killers',                null, 18),
  (24, 'sam.rivera',     'Sam',     'Rivera',    'prefer_not',  true,  'word_of_mouth', null,                                          null, 15),
  (25, 'lucas.martin',   'Lucas',   'Martin',    'never',       true,  'javelin',       null,                                          'Serving', 12),
  (26, 'julia.novak',    'Julia',   'Novak',     'some',        true,  'instagram',     null,                                          null, 10);

-- auth.users rows (no password, no identity: nobody can sign in as them). The
-- on_auth_user_created trigger makes each profile.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
       key || '@demo.intro2volleyball.test', '', now() - make_interval(days => joined_days),
       '{"provider": "email", "providers": ["email"], "demo": true}',
       jsonb_build_object('full_name', first_name || ' ' || last_name, 'name', first_name || ' ' || last_name),
       now() - make_interval(days => joined_days), now() - make_interval(days => joined_days),
       '', '', '', ''
  from demo_players;

-- The one-time profile form, filled in.
update public.profiles p
   set first_name = d.first_name,
       last_name = d.last_name,
       display_name = d.first_name || ' ' || left(d.last_name, 1) || '.',
       phone = '416-555-01' || lpad(d.n::text, 2, '0'),
       skill_level = d.skill,
       attended_before = d.attended,
       learning_goals = d.goals,
       hype_song = d.song,
       heard_about = d.heard,
       heard_about_other = case when d.heard = 'other' then 'Saw the poster at Aaniin' end,
       media_consent = d.n not in (7, 17, 24),
       media_consent_at = now() - make_interval(days => d.joined_days),
       waiver_accepted_at = now() - make_interval(days => d.joined_days),
       waiver_version = '2026-10',
       announcement_emails = false, -- never email the demo addresses
       onboarded_at = now() - make_interval(days => d.joined_days),
       created_at = now() - make_interval(days => d.joined_days)
  from demo_players d
 where p.email = d.key || '@demo.intro2volleyball.test';

-------------------------------------------------------------------------------
-- Sessions and sign-ups
-------------------------------------------------------------------------------
do $$
declare
  v_now timestamptz := now();
  v_tz text;
  t public.session_templates;
  a public.sessions;
  v_b uuid := 'de3a0000-0000-4000-a000-00000000000b';
  v_c uuid := 'de3a0000-0000-4000-a000-00000000000c';
  v_d uuid := 'de3a0000-0000-4000-a000-00000000000d';
  v_a_date date;
  v_b_start timestamptz;
  v_c_start timestamptz;
  v_d_start timestamptz;
  v_reg uuid;
  v_regs jsonb := '{}'; -- key -> registration id for the session being built
  v_key text;
  v_i int;
  v_teams uuid[];
  rec record;
begin
  -- Weekly template: use the active one, or add the usual Saturday one.
  select * into t from public.session_templates where active order by created_at limit 1;
  if not found then
    insert into public.session_templates (
      id, title, weekday, start_time, duration_minutes, location, capacity, price_cents,
      open_hours_before, hold_hours, cancel_cutoff_hours, timezone,
      instructional_price_cents, instructional_minutes, dropin_offset_minutes
    ) values (
      'de3a0000-0000-4000-a000-000000000001', 'Intro 2 Volleyball', 6, '20:00', 225,
      'Aaniin Community Centre, Gym 2, 5665 14th Avenue, Markham', 18, 1500,
      120, 12, 24, 'America/Toronto', 1000, 45, 60
    ) returning * into t;
  end if;
  v_tz := t.timezone;

  -- Session A: the template's next session (the tick would create it anyway).
  perform public.create_sessions_from_templates();
  select * into a from public.sessions
   where template_id = t.id and status = 'scheduled' and starts_at > v_now + interval '12 hours'
   order by starts_at limit 1;
  if not found then
    raise exception 'demo-seed: the weekly template has no upcoming session';
  end if;
  if a.instructional_price_cents is null then
    raise exception 'demo-seed: session A has no instructional-only price';
  end if;
  v_a_date := (a.starts_at at time zone v_tz)::date;

  -- A was already there (or belongs to the real template): remember what this
  -- script changes on it so demo-clean.sql can put it back.
  if a.template_id is distinct from 'de3a0000-0000-4000-a000-000000000001'::uuid then
    insert into public.devtools_audit (action, target_table, target_id, before, note)
    values ('demo_seed_adopt', 'sessions', a.id::text,
            jsonb_build_object(
              'opens_at', a.opens_at,
              'teams_published_at', a.teams_published_at,
              'schedule_game_minutes', a.schedule_game_minutes,
              'had_teams', exists (select 1 from public.session_teams where session_id = a.id)),
            'demo-seed.sql changed this session; demo-clean.sql restores it');
  end if;
  -- Sign-ups "opened" before the earliest demo sign-up.
  update public.sessions set opens_at = least(opens_at, v_now - interval '3 days 2 hours') where id = a.id;

  ---------------------------------------------------------------------------
  -- A: full drop-in (18 if capacity is 18), plus Ben who switches to instructional
  ---------------------------------------------------------------------------
  v_regs := '{}';
  foreach v_key in array array[
    'maya.tran|3 days', 'daniel.okafor|2 days 23 hours', 'kevin.liu|2 days 20 hours',
    'sofia.martinez|2 days 18 hours', 'arjun.patel|2 days 17 hours', 'hannah.kim|2 days 16 hours',
    'marcus.brown|2 days 10 hours', 'emily.chen|2 days',
    'ben.thompson|10 hours',
    'ryan.oconnor|1 day 22 hours', 'ethan.wilson|1 day 12 hours', 'olivia.smith|1 day 8 hours',
    'chris.park|1 day 6 hours', 'aisha.mohammed|10 hours 50 minutes', 'tyler.nguyen|9 hours',
    'priya.raman|8 hours 30 minutes', 'jordan.lee|8 hours', 'mei.chen|7 hours', 'grace.wong|6 hours'
  ] loop
    v_reg := pg_temp.signup(
      split_part(v_key, '|', 1), a.id, 'full', v_now - split_part(v_key, '|', 2)::interval,
      case split_part(v_key, '|', 1)
        when 'grace.wong' then 'First time! Priya is bringing me.'
        when 'mei.chen' then 'Might be 10 minutes late, coming from work.'
        when 'hannah.kim' then 'Will pay cash at the door.'
      end);
    v_regs := v_regs || jsonb_build_object(split_part(v_key, '|', 1), v_reg);
    -- Ben signs up for drop-in, then switches to Instructional only (frees his spot).
    if split_part(v_key, '|', 1) = 'ben.thompson' then
      perform pg_temp.act_as(pg_temp.pid('ben.thompson'));
      perform public.change_registration_option(v_reg, 'instructional');
    end if;
  end loop;

  -- Instructional only: never takes a spot, never waitlisted.
  v_regs := v_regs
    || jsonb_build_object('zara.ali', pg_temp.signup('zara.ali', a.id, 'instructional', v_now - interval '1 day 4 hours'))
    || jsonb_build_object('lucas.martin', pg_temp.signup('lucas.martin', a.id, 'instructional', v_now - interval '2 days'));

  -- Waitlist (A is full now).
  v_regs := v_regs
    || jsonb_build_object('isabel.rossi', pg_temp.signup('isabel.rossi', a.id, 'full', v_now - interval '5 hours'))
    || jsonb_build_object('sam.rivera', pg_temp.signup('sam.rivera', a.id, 'full', v_now - interval '3 hours 30 minutes',
                                                       'Happy to play any position.'))
    || jsonb_build_object('julia.novak', pg_temp.signup('julia.novak', a.id, 'full', v_now - interval '1 hour 45 minutes'));

  -- Team requests: Sofia + Arjun + Hannah, and Tyler + Aisha (one-way is enough).
  perform pg_temp.act_as(pg_temp.pid('sofia.martinez'));
  perform public.set_team_requests((v_regs ->> 'sofia.martinez')::uuid,
    array[(v_regs ->> 'arjun.patel')::uuid, (v_regs ->> 'hannah.kim')::uuid]);
  perform pg_temp.act_as(pg_temp.pid('tyler.nguyen'));
  perform public.set_team_requests((v_regs ->> 'tyler.nguyen')::uuid, array[(v_regs ->> 'aisha.mohammed')::uuid]);

  -- Bring a Friend: first-timer Grace says Priya brought her; both go to half price.
  perform pg_temp.act_as(pg_temp.pid('grace.wong'));
  perform public.set_brought_by((v_regs ->> 'grace.wong')::uuid, (v_regs ->> 'priya.raman')::uuid);
  perform pg_temp.act_as(null);

  -- Payments. Most sent their e-Transfer with the ref code within hours.
  perform pg_temp.pay_ref((v_regs ->> 'maya.tran')::uuid,      v_now - interval '2 days 22 hours');
  perform pg_temp.pay_ref((v_regs ->> 'daniel.okafor')::uuid,  v_now - interval '2 days 18 hours');
  perform pg_temp.pay_ref((v_regs ->> 'kevin.liu')::uuid,      v_now - interval '2 days 19 hours');
  perform pg_temp.pay_ref((v_regs ->> 'sofia.martinez')::uuid, v_now - interval '2 days 15 hours');
  perform pg_temp.pay_ref((v_regs ->> 'arjun.patel')::uuid,    v_now - interval '2 days 16 hours');
  perform pg_temp.mark_paid((v_regs ->> 'hannah.kim')::uuid,   v_now - interval '1 day 20 hours');
  perform pg_temp.pay_ref((v_regs ->> 'marcus.brown')::uuid,   v_now - interval '2 days 7 hours');
  perform pg_temp.pay_ref((v_regs ->> 'emily.chen')::uuid,     v_now - interval '1 day 18 hours');
  perform pg_temp.pay_ref((v_regs ->> 'ryan.oconnor')::uuid,   v_now - interval '1 day 20 hours');
  perform pg_temp.pay_ref((v_regs ->> 'ethan.wilson')::uuid,   v_now - interval '1 day 11 hours');
  perform pg_temp.pay_ref((v_regs ->> 'olivia.smith')::uuid,   v_now - interval '1 day 4 hours');
  perform pg_temp.mark_paid((v_regs ->> 'chris.park')::uuid,   v_now - interval '6 hours');
  perform pg_temp.pay_ref((v_regs ->> 'zara.ali')::uuid,       v_now - interval '1 day 1 hour');
  perform pg_temp.mark_paid((v_regs ->> 'lucas.martin')::uuid, v_now - interval '1 day 22 hours');
  -- Recent: Priya pays her half-price spot by ref code ...
  perform pg_temp.pay_ref((v_regs ->> 'priya.raman')::uuid,    v_now - interval '1 hour 30 minutes');
  -- ... Jordan forgot the code, matched by name + exact amount ...
  perform pg_temp.etransfer((v_regs ->> 'jordan.lee')::uuid, null, 'name_amount', v_now - interval '2 hours',
                            null, 'saturday volleyball');
  -- ... Tyler sent $10 of $15 (spot stays held for the rest) ...
  perform pg_temp.etransfer((v_regs ->> 'tyler.nguyen')::uuid, 1000, 'ref', v_now - interval '4 hours');
  -- ... and a transfer from "M CHEN" with no code matches nobody: Mei's, for the host to assign.
  perform pg_temp.etransfer((v_regs ->> 'mei.chen')::uuid, 1500, null, v_now - interval '3 hours 40 minutes',
                            'M CHEN', 'sat volleyball',
                            'No ref code; no pending sign-up for "M CHEN" at this amount');
  -- Aisha's hold runs out in about an hour; then the tick frees her spot and
  -- promotes Isabel from the waitlist. Grace, Ben and Mei are still holding.

  ---------------------------------------------------------------------------
  -- B: the week after, about half full, mostly unpaid
  ---------------------------------------------------------------------------
  v_b_start := a.starts_at + interval '7 days';
  insert into public.sessions (
    id, template_id, title, starts_at, ends_at, location, capacity, price_cents, opens_at, hold_hours,
    cancel_cutoff, instructional_price_cents, instructional_ends_at, dropin_starts_at
  ) values (
    v_b, t.id, t.title, v_b_start, v_b_start + make_interval(mins => t.duration_minutes), t.location,
    t.capacity, t.price_cents, v_now - interval '1 day', t.hold_hours,
    v_b_start - make_interval(hours => t.cancel_cutoff_hours), t.instructional_price_cents,
    v_b_start + make_interval(mins => coalesce(t.instructional_minutes, 45)),
    v_b_start + make_interval(mins => coalesce(t.dropin_offset_minutes, 60))
  );
  v_regs := '{}';
  foreach v_key in array array[
    'maya.tran|20 hours', 'ethan.wilson|18 hours', 'daniel.okafor|9 hours', 'kevin.liu|7 hours',
    'marcus.brown|6 hours', 'emily.chen|4 hours', 'isabel.rossi|3 hours', 'leo.ferreira|2 hours',
    'ryan.oconnor|1 hour'
  ] loop
    v_reg := pg_temp.signup(split_part(v_key, '|', 1), v_b, 'full', v_now - split_part(v_key, '|', 2)::interval,
      case when split_part(v_key, '|', 1) = 'leo.ferreira' then 'Never played before, excited to try!' end);
    v_regs := v_regs || jsonb_build_object(split_part(v_key, '|', 1), v_reg);
  end loop;
  v_regs := v_regs || jsonb_build_object('nadia.haddad',
    pg_temp.signup('nadia.haddad', v_b, 'instructional', v_now - interval '5 hours'));
  perform pg_temp.pay_ref((v_regs ->> 'maya.tran')::uuid, v_now - interval '19 hours');
  perform pg_temp.pay_ref((v_regs ->> 'ethan.wilson')::uuid, v_now - interval '16 hours');

  ---------------------------------------------------------------------------
  -- C: a past Saturday (last week's, unless a session is already in that slot)
  ---------------------------------------------------------------------------
  v_c_start := (v_a_date - 7 + t.start_time) at time zone v_tz;
  if exists (select 1 from public.sessions
              where starts_at between v_c_start - interval '4 hours' and v_c_start + interval '4 hours') then
    v_c_start := (v_a_date - 14 + t.start_time) at time zone v_tz;
  end if;
  -- Built as an upcoming session (sign-ups only work then), moved into the past below.
  insert into public.sessions (
    id, template_id, title, starts_at, ends_at, location, capacity, price_cents, opens_at, hold_hours,
    cancel_cutoff, instructional_price_cents, instructional_ends_at, dropin_starts_at
  ) values (
    v_c, null, t.title, v_now + interval '3 days', v_now + interval '3 days' + make_interval(mins => t.duration_minutes),
    t.location, 18, t.price_cents, v_now - interval '30 days', t.hold_hours, v_now + interval '2 days',
    coalesce(t.instructional_price_cents, 1000), null, null
  );
  v_regs := '{}';
  v_i := 0;
  foreach v_key in array array[
    'maya.tran', 'daniel.okafor', 'kevin.liu', 'priya.raman', 'sofia.martinez', 'arjun.patel', 'hannah.kim',
    'marcus.brown', 'emily.chen', 'jordan.lee', 'mei.chen', 'tyler.nguyen', 'aisha.mohammed', 'ryan.oconnor',
    'chris.park', 'ethan.wilson', 'olivia.smith'
  ] loop
    v_i := v_i + 1;
    v_reg := pg_temp.signup(v_key, v_c, 'full', v_c_start - interval '4 days' + make_interval(hours => v_i * 3));
    v_regs := v_regs || jsonb_build_object(v_key, v_reg);
    if v_key in ('hannah.kim', 'chris.park', 'mei.chen') then
      perform pg_temp.mark_paid(v_reg, v_c_start - interval '4 days' + make_interval(hours => v_i * 3 + 5));
    else
      perform pg_temp.pay_ref(v_reg, v_c_start - interval '4 days' + make_interval(hours => v_i * 3 + 1));
    end if;
  end loop;
  foreach v_key in array array['ben.thompson', 'lucas.martin'] loop
    v_reg := pg_temp.signup(v_key, v_c, 'instructional', v_c_start - interval '2 days');
    perform pg_temp.pay_ref(v_reg, v_c_start - interval '1 day 20 hours');
  end loop;
  -- Olivia cancelled before the cutoff; the host has already sent her money back.
  perform pg_temp.act_as(pg_temp.pid('olivia.smith'));
  perform public.cancel_registration((v_regs ->> 'olivia.smith')::uuid);
  perform pg_temp.act_as(null);
  update public.registrations
     set cancelled_at = v_c_start - interval '2 days', refunded_at = v_c_start - interval '1 day 22 hours'
   where id = (v_regs ->> 'olivia.smith')::uuid;

  -- Move C to its real (past) time.
  update public.sessions
     set starts_at = v_c_start,
         ends_at = v_c_start + make_interval(mins => t.duration_minutes),
         opens_at = v_c_start - make_interval(hours => t.open_hours_before),
         cancel_cutoff = v_c_start - make_interval(hours => t.cancel_cutoff_hours),
         instructional_ends_at = v_c_start + make_interval(mins => coalesce(t.instructional_minutes, 45)),
         dropin_starts_at = v_c_start + make_interval(mins => coalesce(t.dropin_offset_minutes, 60)),
         reminder_sent_at = v_c_start - interval '23 hours',
         teams_published_at = v_c_start - interval '2 hours',
         schedule_game_minutes = 25
   where id = v_c;

  -- Teams: 3 (one per 6 spots), dealt strongest-first in snake order like balanceTeams.
  insert into public.session_teams (session_id, name, position, created_at)
  select v_c, 'Team ' || i, i - 1, v_c_start - interval '3 hours' from generate_series(1, 3) i;
  select array_agg(id order by position) into v_teams from public.session_teams where session_id = v_c;
  for rec in
    select g.id, row_number() over (
             order by case p.skill_level when 'experienced' then 3 when 'some' then 2 when 'never' then 1 else 1.5 end desc,
                      p.first_name)::int - 1 as i
      from public.registrations g join public.profiles p on p.id = g.profile_id
     where g.session_id = v_c and g.status = 'confirmed' and g.option = 'full'
  loop
    update public.registrations
       set team_id = v_teams[1 + case when (rec.i / 3) % 2 = 0 then rec.i % 3 else 2 - rec.i % 3 end]
     where id = rec.id;
  end loop;
  -- Round robin (roundRobin() in src/lib/schedule.ts for 3 teams).
  insert into public.session_matches (session_id, slot, court, team_a_id, team_b_id) values
    (v_c, 1, 1, v_teams[2], v_teams[3]),
    (v_c, 2, 1, v_teams[1], v_teams[3]),
    (v_c, 3, 1, v_teams[1], v_teams[2]);

  ---------------------------------------------------------------------------
  -- D: last Sunday's clinic with a refundable deposit
  ---------------------------------------------------------------------------
  v_d_start := (v_a_date - 6 + time '14:00') at time zone v_tz;
  insert into public.sessions (
    id, template_id, title, starts_at, ends_at, location, capacity, price_cents, opens_at, hold_hours,
    cancel_cutoff, deposit_cents, notes
  ) values (
    v_d, null, 'Sunday Skills Clinic', v_now + interval '3 days', v_now + interval '3 days 2 hours', t.location,
    12, 0, v_now - interval '30 days', t.hold_hours, v_now + interval '2 days', 1000,
    'Free clinic: serving and passing drills. The $10 deposit holds your spot and comes back after the clinic.'
  );
  v_regs := '{}';
  v_i := 0;
  foreach v_key in array array[
    'priya.raman', 'daniel.okafor', 'maya.tran', 'kevin.liu', 'sofia.martinez', 'arjun.patel',
    'marcus.brown', 'emily.chen', 'tyler.nguyen', 'aisha.mohammed', 'chris.park'
  ] loop
    v_i := v_i + 1;
    v_reg := pg_temp.signup(v_key, v_d, 'full', v_d_start - interval '3 days' + make_interval(hours => v_i * 2));
    v_regs := v_regs || jsonb_build_object(v_key, v_reg);
    perform pg_temp.pay_ref(v_reg, v_d_start - interval '3 days' + make_interval(hours => v_i * 2 + 1));
  end loop;
  -- Chris cancelled before the cutoff: deposit owed back (not refunded yet).
  perform pg_temp.act_as(pg_temp.pid('chris.park'));
  perform public.cancel_registration((v_regs ->> 'chris.park')::uuid);
  perform pg_temp.act_as(null);
  update public.registrations set cancelled_at = v_d_start - interval '1 day 6 hours'
   where id = (v_regs ->> 'chris.park')::uuid;

  update public.sessions
     set starts_at = v_d_start,
         ends_at = v_d_start + interval '2 hours',
         opens_at = v_d_start - interval '5 days',
         cancel_cutoff = v_d_start - interval '24 hours',
         reminder_sent_at = v_d_start - interval '23 hours'
   where id = v_d;

  -- The tick releases deposits for sessions that have ended (Refunds -> Deposit).
  perform public.run_tick();
  -- The host has already sent two deposits back.
  update public.registrations
     set refunded_at = least(v_d_start + interval '20 hours', v_now - interval '1 hour')
   where id in ((v_regs ->> 'priya.raman')::uuid, (v_regs ->> 'daniel.okafor')::uuid);

  ---------------------------------------------------------------------------
  -- Updates board
  ---------------------------------------------------------------------------
  insert into public.posts (id, title, body_html, published_at, featured, emailed_at, author_id, created_at, updated_at)
  values
  (
    'de3a0000-0000-4000-a000-000000000102',
    'Fall season at Aaniin: what to bring',
    '<p>We''re back in <strong>Gym 2 at Aaniin Community Centre</strong> every Saturday night this fall.</p>'
    '<ul><li>Indoor court shoes (no black soles)</li><li>A water bottle</li><li>Knee pads if you have them</li></ul>'
    '<p>The first 45 minutes are instructional, then we split into teams for drop-in games.</p>',
    least(v_c_start - interval '5 days', v_now - interval '12 days'),
    false,
    least(v_c_start - interval '5 days', v_now - interval '12 days'),
    pg_temp.admin_id(),
    least(v_c_start - interval '5 days', v_now - interval '12 days'),
    least(v_c_start - interval '5 days', v_now - interval '12 days')
  ),
  (
    'de3a0000-0000-4000-a000-000000000101',
    'Welcome to the new sign-up site!',
    '<p>No more Google Forms! Here''s how signing up works now:</p>'
    '<ol>'
    '<li><strong>Sign in with Google</strong> and fill in your profile once (waiver and photo consent included).</li>'
    '<li><strong>Tap Sign up</strong> on a session. Pick <em>Instructional + Drop-in</em>, or <em>Instructional only</em> if you just want the lesson.</li>'
    '<li><strong>Send an Interac e-Transfer</strong> to intro2volleyball@gmail.com with your <strong>VB- code</strong> in the message. Your spot is confirmed automatically when it arrives.</li>'
    '</ol>'
    '<p>Your spot is held for 12 hours while you pay. If a session is full, join the waitlist: when a spot opens up, the next person in line gets it and an email.</p>'
    '<h3>Also new</h3>'
    '<ul>'
    '<li><strong>Bring a Friend:</strong> bringing someone for their first time? You both pay half.</li>'
    '<li><strong>Team requests:</strong> ask to be on the same team as your friends.</li>'
    '</ul>'
    '<p>Questions? DM us on Instagram <a href="https://www.instagram.com/intro2volleyball/">@intro2volleyball</a>. See you on the court!</p>',
    v_now - interval '2 days',
    not exists (select 1 from public.posts where featured),
    null,
    pg_temp.admin_id(),
    v_now - interval '2 days 1 hour',
    v_now - interval '2 days'
  );

  perform pg_temp.act_as(null);
end $$;

commit;
