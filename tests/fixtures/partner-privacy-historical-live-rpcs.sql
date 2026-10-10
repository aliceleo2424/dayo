CREATE OR REPLACE FUNCTION public.dayo_is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select auth.uid() is not null
     and exists (
       select 1
       from public.profiles
       where id = auth.uid()
         and role = 'admin'
     );
$function$
;
CREATE OR REPLACE FUNCTION public.get_partner_booking_brief(p_booking_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_learner_id uuid;
  v_language text;
  v_brief jsonb;
  v_nickname text;
  v_email text;
begin
  if auth.uid() is null or p_booking_id is null then
    return null;
  end if;

  select b.learner_id, b.language, b.conversation_brief
    into v_learner_id, v_language, v_brief
  from public.bookings b
  where b.id = p_booking_id
    and b.partner_user_id = auth.uid()
    and b.status = 'confirmed';

  if not found then
    return null;
  end if;

  select p.nickname, p.email
    into v_nickname, v_email
  from public.profiles p
  where p.id = v_learner_id or p.user_id = v_learner_id
  order by case when p.id = v_learner_id then 0 else 1 end
  limit 1;

  v_nickname := nullif(pg_catalog.btrim(v_nickname), '');
  if v_nickname is null
     or pg_catalog.strpos(v_nickname, '@') > 0
     or v_nickname ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or (v_email is not null
         and pg_catalog.lower(v_nickname) = pg_catalog.split_part(pg_catalog.lower(v_email), '@', 1)) then
    v_nickname := 'DayO User';
  end if;

  return pg_catalog.jsonb_build_object(
    'learner_avatar_url', (select case when p.avatar_url ~* '^https://([^/]+[.])?(dicebear[.]com|dicebear[.]net)/' or p.avatar_url like '%/images/partner-avatars/%' then null else p.avatar_url end from public.profiles p where p.id=v_learner_id),
    'learner_display_name', v_nickname,
    'language', v_language,
    'conversation_brief', v_brief
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.get_partner_learner_spoken_sentence(p_booking_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_partner_user_id uuid;
  v_spoken_sentence text;
begin
  if v_actor_id is null or p_booking_id is null then
    return jsonb_build_object(
      'success', false,
      'message', '議고쉶 沅뚰븳???뺤씤?????놁뒿?덈떎.'
    );
  end if;

  select bookings.partner_user_id
  into v_partner_user_id
  from public.bookings
  where bookings.id = p_booking_id
    and bookings.status in ('confirmed', 'completed');

  if not found
     or v_partner_user_id is null
     or v_partner_user_id <> v_actor_id then
    return jsonb_build_object(
      'success', false,
      'message', '諛곗젙???뚰듃?덈쭔 臾몄옣???뺤씤?????덉뒿?덈떎.'
    );
  end if;

  select nullif(btrim(session_reports.spoken_sentence), '')
  into v_spoken_sentence
  from public.session_reports
  where session_reports.booking_id = p_booking_id;

  return jsonb_build_object(
    'success', true,
    'spoken_sentence', v_spoken_sentence
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.list_public_partner_profiles()
 RETURNS SETOF jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select pg_catalog.jsonb_build_object(
    'id', p.id,
    'user_id', p.id,
    'nickname', case
      when nullif(pg_catalog.btrim(p.nickname), '') is null
        or pg_catalog.strpos(p.nickname, '@') > 0
        or pg_catalog.strpos(p.nickname, '+') > 0
        or p.nickname ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or (p.email is not null and pg_catalog.lower(pg_catalog.btrim(p.nickname)) =
            pg_catalog.split_part(pg_catalog.lower(p.email), '@', 1))
      then 'DayO Partner'
      else pg_catalog.btrim(p.nickname)
    end,
    'avatar_url', pg_catalog.to_jsonb(p)->>'avatar_url',
    'bio', pg_catalog.to_jsonb(p)->>'bio',
    'conversation_languages', public.dayo_partner_booking_languages(p.id),
    'korean_support_level', c.korean_support_level
  )
  from public.profiles p
  left join public.partner_capabilities c on c.partner_id = p.id
  where auth.uid() is not null
    and p.role = 'partner';
$function$
;