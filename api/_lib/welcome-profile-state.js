'use strict';

const { createClient } = require('@supabase/supabase-js');

function unavailable(message, status = 503) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function prepareWelcome(req, body) {
  const bearer = String(req.headers && req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  if (!bearer) throw unavailable('authentication required', 401);
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const anon = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !anon || !key) throw unavailable('welcome verification unavailable');
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const verified = await createClient(url, anon, options).auth.getUser(bearer[1].trim());
  const user = verified.data && verified.data.user;
  if (verified.error || !user) throw unavailable('authentication required', 401);
  const email = String(user.email || '').trim().toLowerCase();
  if (body.email && String(body.email).trim().toLowerCase() !== email) throw unavailable('email mismatch', 403);
  const service = createClient(url, key, options);
  const result = await service.from('profiles').select('nickname,user_name,welcome_email_sent')
    .eq('id', user.id).maybeSingle();
  if (result.error || !result.data) throw unavailable('welcome verification unavailable');
  const profile = result.data;
  const created = new Date(user.created_at).getTime();
  // Match the existing recent-signup welcome window using verified Auth data.
  const eligible = Number.isFinite(created) && created <= Date.now() && Date.now() - created < 48 * 60 * 60 * 1000;
  const nickname = String(profile.nickname || profile.user_name || '').trim();
  const display = !nickname || nickname.includes('@') || nickname.toLowerCase() === email.split('@')[0] ? '회원' : nickname;
  return { service, userId: user.id, email, nickname: display, skip: profile.welcome_email_sent === true || !eligible };
}

async function markWelcomeSent(context) {
  const result = await context.service.from('profiles').update({ welcome_email_sent: true })
    .eq('id', context.userId).select('id,welcome_email_sent').single();
  if (result.error || !result.data || result.data.welcome_email_sent !== true) {
    throw unavailable('welcome delivery state unavailable');
  }
}

module.exports = { prepareWelcome, markWelcomeSent };
