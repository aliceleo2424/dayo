CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  detected_provider text;
BEGIN
  detected_provider := COALESCE(
    NEW.raw_app_meta_data->>'provider',
    CASE 
      WHEN NEW.raw_user_meta_data->>'iss' LIKE '%kakao%' THEN 'kakao'
      WHEN NEW.raw_user_meta_data->>'iss' LIKE '%google%' THEN 'google'
      WHEN NEW.email IS NOT NULL THEN 'email'
      ELSE '미확인'
    END
  );

  INSERT INTO public.profiles (
    id,
    full_name,
    nickname,
    role,
    ticket_count,
    provider,
    admin_memo,
    avatar_url,
    created_at
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'user',
    0,
    detected_provider,
    NULL,
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', 'https://api.dicebear.com/7.x/bottts/svg?seed=' || NEW.id),
    timezone('utc', now())
  )
  ON CONFLICT (id) DO UPDATE SET
    provider = EXCLUDED.provider;

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.handle_social_user_signup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  raw_meta jsonb;
  user_provider text;
  kakao_uid text;
  user_nick text;
  user_mail text;
  user_avatar text;
BEGIN
  raw_meta := new.raw_user_meta_data;
  user_provider := COALESCE(new.raw_app_meta_data->>'provider', 'email');
  
  -- 카카오 고유 ID 추출 (sub 또는 provider_id)
  kakao_uid := COALESCE(raw_meta->>'provider_id', raw_meta->>'sub', new.id::text);
  
  -- 닉네임 추출 (name, nickname, full_name 순서로 확인)
  user_nick := COALESCE(
    raw_meta->>'name',
    raw_meta->>'nickname',
    raw_meta->>'full_name',
    CASE WHEN user_provider = 'kakao' THEN '카카오 회원 (' || SUBSTRING(new.id::text, 1, 5) || ')' ELSE '새싹 회원' END
  );
  
  -- 이메일 추출
  user_mail := COALESCE(new.email, raw_meta->>'email', '');
  user_avatar := COALESCE(raw_meta->>'avatar_url', raw_meta->>'picture', '');

  -- profiles 테이블 생성/업데이트
  INSERT INTO public.profiles (
    id,
    user_id,
    email,
    nickname,
    user_name,
    avatar_url,
    provider,
    kakao_id,
    role,
    ticket_count,
    tickets
  )
  VALUES (
    new.id,
    new.id,
    user_mail,
    user_nick,
    user_nick,
    user_avatar,
    user_provider,
    CASE WHEN user_provider = 'kakao' THEN kakao_uid ELSE NULL END,
    'user',
    0,
    0
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    nickname = CASE WHEN profiles.nickname IS NULL OR profiles.nickname = '' OR profiles.nickname = '미등록' THEN EXCLUDED.nickname ELSE profiles.nickname END,
    provider = EXCLUDED.provider,
    kakao_id = COALESCE(profiles.kakao_id, EXCLUDED.kakao_id);

  RETURN new;
END;
$function$
;
