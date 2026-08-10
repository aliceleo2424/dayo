/* DayO profiles ↔ localStorage sync (Supabase + offline fallback)
 * Depends on: supabase-env.js, @supabase/supabase-js (CDN ESM)
 */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.2/+esm';

var PROFILE_KEY = 'dayo.profileKey';
var USER_KEY = 'userName';
var EMAIL_KEY = 'dayo_userEmail';
var TICKET_KEY = 'ticketCount';
var STREAK_KEY = 'streakCount';
var LAST_LOGIN_KEY = 'lastLoginDate';
var SPEED_KEY = 'dayo.chat.speed';
var STYLE_KEY = 'dayo.chat.style';
var REQUEST_KEY = 'dayo.chat.request';

var supabase = null;
var profileCache = null;
var readyPromise = null;

function env(name) {
  try {
    return (window.__DAYO_ENV__ && window.__DAYO_ENV__[name]) || '';
  } catch (e) {
    return '';
  }
}

function normalizeUrl(url) {
  return String(url || '').replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
}

function lsGet(key, fallback) {
  try {
    var v = window.localStorage.getItem(key);
    return v == null || v === '' ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

function lsSet(key, value) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch (e) { /* ignore */ }
}

function getClient() {
  if (supabase) return supabase;
  var url = normalizeUrl(env('NEXT_PUBLIC_SUPABASE_URL'));
  var key = env('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!url || !key) return null;
  try {
    supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  } catch (e) {
    console.warn('[DayO] Supabase client init failed', e);
    supabase = null;
  }
  return supabase;
}

function uuid() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = (Math.random() * 16) | 0;
    var v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getClientKey() {
  var email = lsGet(EMAIL_KEY, '').trim().toLowerCase();
  if (email) {
    lsSet(PROFILE_KEY, 'email:' + email);
    return 'email:' + email;
  }
  var existing = lsGet(PROFILE_KEY, '');
  if (existing) return existing;
  var key = 'anon:' + uuid();
  lsSet(PROFILE_KEY, key);
  return key;
}

function defaultsFromLocal() {
  var ticket = parseInt(lsGet(TICKET_KEY, '1'), 10);
  var streak = parseInt(lsGet(STREAK_KEY, '1'), 10);
  return {
    client_key: getClientKey(),
    user_name: lsGet(USER_KEY, ''),
    email: lsGet(EMAIL_KEY, ''),
    ticket_count: Number.isFinite(ticket) && ticket >= 0 ? ticket : 1,
    streak_count: Number.isFinite(streak) && streak > 0 ? streak : 1,
    last_login_date: lsGet(LAST_LOGIN_KEY, ''),
    speech_speed: lsGet(SPEED_KEY, 'slow') || 'slow',
    preferred_style: lsGet(STYLE_KEY, 'casual') || 'casual',
    preferred_request: lsGet(REQUEST_KEY, 'praise') || 'praise'
  };
}

function applyProfileToLocal(profile) {
  if (!profile) return;
  if (profile.user_name) lsSet(USER_KEY, profile.user_name);
  if (profile.email) lsSet(EMAIL_KEY, profile.email);
  if (profile.ticket_count != null) lsSet(TICKET_KEY, profile.ticket_count);
  if (profile.streak_count != null) lsSet(STREAK_KEY, profile.streak_count);
  if (profile.last_login_date != null) lsSet(LAST_LOGIN_KEY, profile.last_login_date || '');
  if (profile.speech_speed) lsSet(SPEED_KEY, profile.speech_speed);
  if (profile.preferred_style) lsSet(STYLE_KEY, profile.preferred_style);
  if (profile.preferred_request) lsSet(REQUEST_KEY, profile.preferred_request);

  if (window.DayOTicketWallet && typeof window.DayOTicketWallet.syncUI === 'function') {
    window.DayOTicketWallet.syncUI(Number(profile.ticket_count));
  }
  document.dispatchEvent(new CustomEvent('dayo:profilechange', { detail: profile }));
  document.dispatchEvent(new CustomEvent('dayo:ticketchange', {
    detail: { ticketCount: Number(profile.ticket_count) || 0, added: 0 }
  }));
  document.dispatchEvent(new CustomEvent('dayo:chatprefschange', {
    detail: {
      speed: profile.speech_speed,
      style: profile.preferred_style,
      request: profile.preferred_request
    }
  }));
}

async function fetchOrCreateProfile() {
  var client = getClient();
  var local = defaultsFromLocal();
  if (!client) {
    profileCache = Object.assign({ id: null, _offline: true }, local);
    return profileCache;
  }

  try {
    var select = await client
      .from('profiles')
      .select('*')
      .eq('client_key', local.client_key)
      .maybeSingle();

    if (select.error) throw select.error;

    if (select.data) {
      profileCache = select.data;
      applyProfileToLocal(profileCache);
      return profileCache;
    }

    var insertPayload = Object.assign({}, local, {
      updated_at: new Date().toISOString()
    });
    var inserted = await client.from('profiles').insert(insertPayload).select('*').single();
    if (inserted.error) throw inserted.error;
    profileCache = inserted.data;
    applyProfileToLocal(profileCache);
    return profileCache;
  } catch (err) {
    console.warn('[DayO] profiles sync failed — using localStorage fallback', err);
    profileCache = Object.assign({ id: null, _offline: true }, local);
    return profileCache;
  }
}

function mirrorLocalFields(profile) {
  if (!profile) return;
  if (profile.user_name != null) lsSet(USER_KEY, profile.user_name);
  if (profile.email != null) lsSet(EMAIL_KEY, profile.email);
  if (profile.ticket_count != null) lsSet(TICKET_KEY, profile.ticket_count);
  if (profile.streak_count != null) lsSet(STREAK_KEY, profile.streak_count);
  if (profile.last_login_date != null) lsSet(LAST_LOGIN_KEY, profile.last_login_date || '');
  if (profile.speech_speed) lsSet(SPEED_KEY, profile.speech_speed);
  if (profile.preferred_style) lsSet(STYLE_KEY, profile.preferred_style);
  if (profile.preferred_request) lsSet(REQUEST_KEY, profile.preferred_request);
}

async function updateProfile(partial, options) {
  var opts = options || {};
  var base = profileCache || defaultsFromLocal();
  var next = Object.assign({}, base, partial || {}, {
    client_key: (partial && partial.client_key) || base.client_key || getClientKey(),
    updated_at: new Date().toISOString()
  });

  // Always mirror to localStorage first (offline-safe)
  mirrorLocalFields(next);
  profileCache = next;
  if (!opts.skipEvents) applyProfileToLocal(next);

  var client = getClient();
  if (!client || !next.client_key) return next;

  try {
    var payload = {
      client_key: next.client_key,
      user_name: next.user_name || '',
      email: next.email || '',
      ticket_count: Number(next.ticket_count) || 0,
      streak_count: Number(next.streak_count) || 1,
      last_login_date: next.last_login_date || '',
      speech_speed: next.speech_speed || 'slow',
      preferred_style: next.preferred_style || 'casual',
      preferred_request: next.preferred_request || 'praise',
      updated_at: next.updated_at
    };

    var result = await client
      .from('profiles')
      .upsert(payload, { onConflict: 'client_key' })
      .select('*')
      .single();

    if (result.error) throw result.error;
    profileCache = result.data;
    return profileCache;
  } catch (err) {
    console.warn('[DayO] profiles update failed — localStorage kept', err);
    return next;
  }
}

/** After login: rebind client_key to email and load/create that profile row */
async function rebindIdentity(name, email) {
  if (name) lsSet(USER_KEY, name);
  if (email) lsSet(EMAIL_KEY, email);
  var key = getClientKey();
  readyPromise = null;
  profileCache = null;
  var profile = await fetchOrCreateProfile();
  return updateProfile({
    client_key: key,
    user_name: name || profile.user_name || '',
    email: email || profile.email || ''
  }, { skipEvents: false });
}

function getProfile() {
  return profileCache || defaultsFromLocal();
}

function ready() {
  if (!readyPromise) readyPromise = fetchOrCreateProfile();
  return readyPromise;
}

window.DayOProfileStore = {
  ready: ready,
  getProfile: getProfile,
  updateProfile: updateProfile,
  fetchOrCreateProfile: fetchOrCreateProfile,
  rebindIdentity: rebindIdentity,
  getClientKey: getClientKey
};

ready().catch(function (e) {
  console.warn('[DayO] profile bootstrap error', e);
});
