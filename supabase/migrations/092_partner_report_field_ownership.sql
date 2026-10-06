-- Partner report ownership hardening. Production function inspected 2026-10-06.
-- Only partner_comment, stamp, and the still-used theme/illustration fields
-- (keyword, illust_url) are accepted as report content. All other JSON keys
-- are ignored on both initial insert and retry. Booking identity remains
-- server-derived. Learner RPC, table schema, RLS, grants and existing data
-- are unchanged; CREATE OR REPLACE preserves the existing function ACL.
begin;

CREATE OR REPLACE FUNCTION public.merge_partner_session_report(p_booking_id uuid, p_report jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_actor_id uuid := auth.uid();
 v_booking_learner_id uuid;
 v_booking_partner_id uuid;
 v_booking_partner_user_id uuid;
 v_booking_partner_name text;
 v_report_id uuid;
begin
 if v_actor_id is null or p_booking_id is null then
 return jsonb_build_object(
 'success', false,
 'message', '로그인된 예약 정보를 확인할 수 없습니다.'
 );
 end if;

 p_report := coalesce(p_report, '{}'::jsonb);

 select
 bookings.learner_id,
 bookings.partner_id,
 bookings.partner_user_id,
 bookings.partner_name
 into
 v_booking_learner_id,
 v_booking_partner_id,
 v_booking_partner_user_id,
 v_booking_partner_name
 from public.bookings
 where bookings.id = p_booking_id
 and bookings.partner_user_id = v_actor_id
 and bookings.status in ('confirmed', 'completed')
 for share;

 if not found
 or v_booking_learner_id is null
 or v_booking_partner_user_id is null
 or v_booking_partner_user_id <> v_actor_id then
 return jsonb_build_object(
 'success', false,
 'message', '예약된 파트너 본인만 저장할 수 있습니다.'
 );
 end if;

 insert into public.session_reports as existing (
 booking_id,
 learner_id,
 partner_id,
 partner_user_id,
 partner_name,
 keyword,
 illust_url,
 partner_comment,
 stamp
 ) values (
 p_booking_id,
 v_booking_learner_id,
 v_booking_partner_id,
 v_booking_partner_user_id,
 v_booking_partner_name,
 nullif(btrim(p_report ->> 'keyword'), ''),
 nullif(btrim(p_report ->> 'illust_url'), ''),
 nullif(btrim(p_report ->> 'partner_comment'), ''),
 nullif(btrim(p_report ->> 'stamp'), '')
 )
 on conflict (booking_id) do update
 set learner_id = excluded.learner_id,
 partner_id = excluded.partner_id,
 partner_user_id = excluded.partner_user_id,
 partner_name = coalesce(excluded.partner_name, existing.partner_name),
 keyword = coalesce(excluded.keyword, existing.keyword),
 illust_url = coalesce(excluded.illust_url, existing.illust_url),
 partner_comment = coalesce(excluded.partner_comment, existing.partner_comment),
 stamp = coalesce(excluded.stamp, existing.stamp)
 returning id into v_report_id;

 return jsonb_build_object(
 'success', true,
 'report_id', v_report_id,
 'learner_id', v_booking_learner_id
 );
end;
$function$;

notify pgrst, 'reload schema';
commit;
