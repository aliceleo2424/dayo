-- Owner decision 2026-10-14: show the partner's own nickname (대화명) as-is wherever the
-- public partner list is used (room, report, Letter). Only contact-like values are withheld.
create or replace function public.list_public_partner_profiles()
 returns setof jsonb language sql stable security definer set search_path to '' as $function$
  select pg_catalog.jsonb_build_object(
    'id', p.id,
    'user_id', p.id,
    'nickname', coalesce(i.public_name, candidate.public_name, nick.value, 'DayO Partner'),
    'public_name_ready', coalesce(i.public_name, candidate.public_name, nick.value) is not null,
    'avatar_url', pg_catalog.to_jsonb(p)->>'avatar_url',
    'bio', pg_catalog.to_jsonb(p)->>'bio',
    'conversation_languages', public.dayo_partner_booking_languages(p.id),
    'korean_support_level', c.korean_support_level
  )
  from public.profiles p
  left join public.partner_capabilities c on c.partner_id = p.id
  left join public.partner_public_identity i on i.partner_id = p.id
  left join lateral dayo_partner_privacy.name_candidate(p.id) candidate on true
  left join lateral (select nullif(pg_catalog.btrim(p.nickname),'') as value
    where pg_catalog.btrim(coalesce(p.nickname,'')) !~* '[@+]|https?://|www\.' and pg_catalog.length(pg_catalog.btrim(coalesce(p.nickname,''))) <= 40) nick on true
  where auth.uid() is not null
    and p.role = 'partner';
$function$;
