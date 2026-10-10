-- PARTNER-PRIVACY-01: NEW Partner identity/referral migration. LOCAL DRAFT; not applied.
-- Production read-only verification: 2026-10-10, mmhapsimcngmtefqfrcg, PostgreSQL 17.6.
-- No application migration ledger exists. Git contains 001..103; 104 is excluded.
-- Historical privacy remediation remains deferred. No historical views, redaction or privilege changes.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.partner_public_identity') IS NOT NULL OR to_regnamespace('dayo_partner_privacy') IS NOT NULL THEN
   RAISE EXCEPTION 'partner_identity_baseline_changed';
 END IF;
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='partner_applications' AND column_name='referring_partner_id') THEN
   RAISE EXCEPTION 'partner_referral_storage_baseline_changed';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN
   ('get_my_partner_privacy','save_my_partner_public_name','get_partner_public_name','get_admin_partner_name_reviews',
    'ensure_my_partner_referral_code','guard_partner_referral_code','validate_partner_referral_code','attribute_partner_referral')) THEN
   RAISE EXCEPTION 'partner_identity_rpc_baseline_changed';
 END IF;
 IF md5(pg_get_functiondef('public.list_public_partner_profiles()'::regprocedure)) <> 'c7e0ec9852838f3a7d417a7fe31c56fc' THEN
   RAISE EXCEPTION 'partner_public_profile_baseline_changed';
 END IF;
 IF md5(pg_get_functiondef('public.dayo_is_admin()'::regprocedure)) <> 'b932d95fb53315d3521fc15648ea116b' THEN
   RAISE EXCEPTION 'partner_admin_baseline_changed';
 END IF;
 IF (SELECT md5(string_agg(column_name||':'||udt_name||':'||is_nullable,'|' ORDER BY column_name))
     FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles'
       AND column_name IN ('id','role','nickname','full_name')) IS DISTINCT FROM '0e66d0a492b706cab0a52bbf89a734ce' THEN
   RAISE EXCEPTION 'partner_profile_columns_baseline_changed';
 END IF;
 IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='partner_applications'
       AND ((column_name='id' AND udt_name='uuid' AND is_nullable='NO') OR
            (column_name='referral_code' AND udt_name='text' AND is_nullable='NO'))) <> 2 OR
    (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.partner_applications'::regclass
       AND conname='partner_applications_referral_code_check') IS DISTINCT FROM 'CHECK ((length(referral_code) <= 100))' THEN
   RAISE EXCEPTION 'partner_referral_contract_baseline_changed';
 END IF;
 IF to_regcollation('pg_catalog."und-x-icu"') IS NULL THEN RAISE EXCEPTION 'unicode_name_collation_missing'; END IF;
 IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='auth' AND table_name='identities'
       AND ((column_name IN ('user_id') AND udt_name='uuid') OR
            (column_name='provider' AND udt_name='text') OR (column_name='identity_data' AND udt_name='jsonb'))) <> 3 THEN
   RAISE EXCEPTION 'structured_identity_source_missing';
 END IF;
 IF to_regprocedure('extensions.gen_random_bytes(integer)') IS NULL THEN RAISE EXCEPTION 'crypto_source_missing'; END IF;
END $$;
CREATE SCHEMA dayo_partner_privacy;
REVOKE ALL ON SCHEMA dayo_partner_privacy FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION dayo_partner_privacy.valid_name(n text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT n IS NOT NULL AND n=btrim(n) AND length(n) BETWEEN 1 AND 50
   AND n COLLATE pg_catalog."und-x-icu" ~ '^[[:alpha:]][[:alpha:]''’-]*( [[:alpha:]]\.?)?$'
$$;
CREATE TABLE public.partner_public_identity (
 partner_id uuid PRIMARY KEY REFERENCES public.profiles(id),
 public_name text,
 confirmed_at timestamptz, -- internal readiness timestamp, NOT an extra user confirmation step
 name_source text CHECK(name_source IN ('partner','existing_nickname','provider_given_name','admin_review')),
 needs_name_review boolean NOT NULL DEFAULT false,
 review_reason text,
 referral_code text UNIQUE CHECK(referral_code IS NULL OR referral_code ~ '^DY-[A-HJ-NP-Z2-9]{8}$'),
 CHECK ((public_name IS NULL AND confirmed_at IS NULL) OR
   (dayo_partner_privacy.valid_name(public_name) AND confirmed_at IS NOT NULL))
);
ALTER TABLE public.partner_public_identity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.partner_public_identity FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.partner_public_identity TO authenticated,service_role;
CREATE POLICY partner_identity_owner_read ON public.partner_public_identity FOR SELECT TO authenticated USING(partner_id=auth.uid());

CREATE FUNCTION dayo_partner_privacy.name_candidate(who uuid)
RETURNS TABLE(public_name text,name_source text,review_reason text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.profiles; stored public.partner_public_identity; given text; given_count int;
BEGIN
 SELECT * INTO p FROM public.profiles WHERE id=who AND role='partner';
 IF NOT FOUND THEN RETURN; END IF;
 SELECT * INTO stored FROM public.partner_public_identity WHERE partner_id=who;
 IF stored.confirmed_at IS NOT NULL AND dayo_partner_privacy.valid_name(stored.public_name) THEN
   RETURN QUERY SELECT stored.public_name,coalesce(stored.name_source,'partner'),NULL::text; RETURN;
 END IF;
 -- Preserve every existing nickname that already follows the public format, including legal-name equality.
 IF dayo_partner_privacy.valid_name(btrim(p.nickname)) THEN
   RETURN QUERY SELECT btrim(p.nickname),'existing_nickname'::text,NULL::text; RETURN;
 END IF;
 SELECT count(DISTINCT lower(n)),min(n) INTO given_count,given FROM (
   SELECT btrim(identity_data->>key) n FROM auth.identities CROSS JOIN unnest(ARRAY['given_name','first_name']) key
     WHERE user_id=who AND provider IN ('google','kakao')
       AND nullif(btrim(identity_data->>key),'') IS NOT NULL
 ) supplied;
 IF given_count=1 AND dayo_partner_privacy.valid_name(given) AND strpos(given,' ')=0 THEN
   IF nullif(btrim(p.full_name),'') IS NULL OR
      strpos(' '||lower(regexp_replace(btrim(p.full_name),'[[:space:]]+',' ','g'))||' ',' '||lower(given)||' ')>0 THEN
     RETURN QUERY SELECT given,'provider_given_name'::text,NULL::text; RETURN;
   END IF;
   RETURN QUERY SELECT NULL::text,'admin_review'::text,'given_name_mismatch'::text; RETURN;
 END IF;
 RETURN QUERY SELECT NULL::text,'admin_review'::text,
   CASE WHEN given_count>1 THEN 'conflicting_given_names' ELSE 'ambiguous_name' END;
END $$;

CREATE FUNCTION dayo_partner_privacy.initialize_name(who uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE candidate record; current_name public.partner_public_identity;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=who AND role='partner') THEN RETURN; END IF;
 INSERT INTO public.partner_public_identity(partner_id) VALUES(who) ON CONFLICT(partner_id) DO NOTHING;
 SELECT * INTO current_name FROM public.partner_public_identity WHERE partner_id=who FOR UPDATE;
 -- Explicitly chosen valid names and immutable codes are never regenerated by initialization.
 IF current_name.confirmed_at IS NOT NULL AND dayo_partner_privacy.valid_name(current_name.public_name) THEN RETURN; END IF;
 SELECT * INTO candidate FROM dayo_partner_privacy.name_candidate(who);
 UPDATE public.partner_public_identity SET public_name=candidate.public_name,
   confirmed_at=CASE WHEN candidate.public_name IS NOT NULL THEN now() END,
   name_source=candidate.name_source,needs_name_review=candidate.public_name IS NULL,review_reason=candidate.review_reason
 WHERE partner_id=who;
 -- Narrow legacy nickname conversion: only a known legal-name copy with a reliable given name.
 IF candidate.public_name IS NOT NULL AND candidate.name_source='provider_given_name' THEN
   UPDATE public.profiles SET nickname=candidate.public_name WHERE id=who AND role='partner'
     AND lower(btrim(nickname))=lower(btrim(full_name));
 END IF;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA dayo_partner_privacy FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.get_my_partner_privacy() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.partner_public_identity;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='partner') THEN
   RAISE EXCEPTION 'partner_required' USING errcode='42501'; END IF;
 PERFORM dayo_partner_privacy.initialize_name(auth.uid());
 SELECT * INTO r FROM public.partner_public_identity WHERE partner_id=auth.uid();
 RETURN jsonb_build_object('public_name',r.public_name,'confirmed_at',r.confirmed_at,'name_source',r.name_source,
   'needs_name_review',r.needs_name_review,'referral_code',r.referral_code);
END $$;
CREATE FUNCTION public.save_my_partner_public_name(p_public_name text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n text:=btrim(p_public_name);
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='partner') THEN
   RAISE EXCEPTION 'partner_required' USING errcode='42501'; END IF;
 IF NOT dayo_partner_privacy.valid_name(n) THEN RAISE EXCEPTION 'invalid_public_name_format' USING errcode='22023'; END IF;
 INSERT INTO public.partner_public_identity(partner_id,public_name,confirmed_at,name_source)
 VALUES(auth.uid(),n,now(),'partner') ON CONFLICT(partner_id) DO UPDATE SET public_name=excluded.public_name,
   confirmed_at=excluded.confirmed_at,name_source='partner',needs_name_review=false,review_reason=NULL;
 UPDATE public.profiles SET nickname=n WHERE id=auth.uid() AND role='partner';
 RETURN public.get_my_partner_privacy();
END $$;

CREATE FUNCTION public.get_partner_public_name(p_partner_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM dayo_partner_privacy.initialize_name(p_partner_id);
 RETURN coalesce((SELECT public_name FROM public.partner_public_identity i
   JOIN public.profiles p ON p.id=i.partner_id WHERE i.partner_id=p_partner_id AND p.role='partner'),'DayO Partner');
END $$;
REVOKE ALL ON FUNCTION public.get_partner_public_name(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_partner_public_name(uuid) TO service_role;

CREATE FUNCTION public.get_admin_partner_name_reviews() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.dayo_is_admin() THEN RAISE EXCEPTION 'admin_required' USING errcode='42501'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('partner_id',p.id,'legal_name',p.full_name,'nickname',p.nickname,
   'review_reason',i.review_reason) ORDER BY p.id),'[]'::jsonb) FROM public.partner_public_identity i
   JOIN public.profiles p ON p.id=i.partner_id WHERE p.role='partner' AND i.needs_name_review);
END $$;

create function public.ensure_my_partner_referral_code() returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.partner_public_identity; raw bytea; code text; alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='partner') then
    raise exception 'partner_required' using errcode='42501';
  end if;
  insert into public.partner_public_identity(partner_id) values(auth.uid()) on conflict(partner_id) do nothing;
  select * into r from public.partner_public_identity where partner_id=auth.uid() for update;
  if r.referral_code is not null then return public.get_my_partner_privacy(); end if;
  for attempt in 1..16 loop
    raw := extensions.gen_random_bytes(8); code := 'DY-';
    -- 32-symbol alphabet: byte % 32 has no modulo bias.
    for i in 0..7 loop code := code || substr(alphabet,1+get_byte(raw,i)%32,1); end loop;
    begin
      update public.partner_public_identity set referral_code=code where partner_id=auth.uid();
      return public.get_my_partner_privacy();
    exception when unique_violation then null;
    end;
  end loop;
  raise exception 'referral_code_unavailable';
end $$;

create function public.guard_partner_referral_code() returns trigger language plpgsql set search_path='' as $$
begin
  if new.partner_id is distinct from old.partner_id or
    (old.referral_code is not null and new.referral_code is distinct from old.referral_code) then
    raise exception 'immutable_partner_referral';
  end if;
  return new;
end $$;
create trigger partner_referral_immutable before update on public.partner_public_identity
  for each row execute function public.guard_partner_referral_code();

create function public.validate_partner_referral_code(p_code text) returns boolean language sql stable security definer set search_path='' as $$
  select p_code ~ '^DY-[A-HJ-NP-Z2-9]{8}$' and exists
    (select 1 from public.partner_public_identity i join public.profiles p on p.id=i.partner_id
      where i.referral_code=p_code and p.role='partner');
$$;

alter table public.partner_applications add column referring_partner_id uuid references public.profiles(id);
create function public.attribute_partner_referral() returns trigger language plpgsql security definer set search_path='' as $$
begin
  new.referring_partner_id := null;
  if coalesce(new.referral_code,'')='' then return new; end if;
  -- Legacy names stay as strings without inferred attribution, including old clients.
  if new.referral_code !~* '^DY-' then return new; end if;
  if not public.validate_partner_referral_code(new.referral_code) then raise exception 'invalid_referral_code'; end if;
  select partner_id into new.referring_partner_id from public.partner_public_identity where referral_code=new.referral_code;
  return new;
end $$;
create trigger partner_referral_attribution before insert on public.partner_applications
  for each row execute function public.attribute_partner_referral();

REVOKE ALL ON FUNCTION public.get_my_partner_privacy(),public.save_my_partner_public_name(text),
 public.ensure_my_partner_referral_code(),public.validate_partner_referral_code(text),public.guard_partner_referral_code(),
 public.attribute_partner_referral(),public.get_admin_partner_name_reviews() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_my_partner_privacy(),public.save_my_partner_public_name(text),
 public.ensure_my_partner_referral_code(),public.get_admin_partner_name_reviews() TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_partner_referral_code(text) TO anon,authenticated;

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT id FROM public.profiles WHERE role='partner' LOOP PERFORM dayo_partner_privacy.initialize_name(p.id); END LOOP;
END $$;

-- Verified live public RPC; only public-name projection/LEFT JOINs differ. Existing eligibility and grants stay intact.
CREATE OR REPLACE FUNCTION public.list_public_partner_profiles()
 RETURNS SETOF jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select pg_catalog.jsonb_build_object(
    'id', p.id,
    'user_id', p.id,
    'nickname', coalesce(i.public_name, candidate.public_name, 'DayO Partner'),
    'public_name_ready', coalesce(i.public_name, candidate.public_name) is not null,
    'avatar_url', pg_catalog.to_jsonb(p)->>'avatar_url',
    'bio', pg_catalog.to_jsonb(p)->>'bio',
    'conversation_languages', public.dayo_partner_booking_languages(p.id),
    'korean_support_level', c.korean_support_level
  )
  from public.profiles p
  left join public.partner_capabilities c on c.partner_id = p.id
  left join public.partner_public_identity i on i.partner_id = p.id
  left join lateral dayo_partner_privacy.name_candidate(p.id) candidate on true
  where auth.uid() is not null
    and p.role = 'partner';
$function$;

NOTIFY pgrst,'reload schema';
COMMIT;
