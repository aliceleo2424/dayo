/* DayO profiles ↔ localStorage sync (Supabase + offline fallback)
 * Depends on: supabase-env.js, @supabase/supabase-js (CDN ESM)
 */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.2/+esm';

var PROFILE_KEY = 'dayo.profileKey';
var USER_KEY = 'userName';
var EMAIL_KEY = 'dayo_userEmail';
var AUTH_ID_KEY = 'dayo.authUserId';
var MEMBER_KEY = 'dayo.memberSession';
var TICKET_KEY = 'ticketCount';
var STREAK_KEY = 'streakCount';
var LAST_LOGIN_KEY = 'lastLoginDate';
var SPEED_KEY = 'dayo.chat.speed';
var STYLE_KEY = 'dayo.chat.style';
var REQUEST_KEY = 'dayo.chat.request';
var JAM_KEY = 'dayo.jamCount';
var VOCAB_KEY = 'dayo.reviewVocab';

var supabase = null;
var profileCache = null;
var readyPromise = null;
var authUser = null;
var authBound = false;

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
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage
      }
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

function getAuthUserId() {
  if (authUser && authUser.id) return authUser.id;
  return lsGet(AUTH_ID_KEY, '');
}

function getClientKey() {
  var uid = getAuthUserId();
  if (uid) {
    lsSet(PROFILE_KEY, 'user:' + uid);
    return 'user:' + uid;
  }
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

function nameFromEmail(email) {
  var local = String(email || '').split('@')[0] || 'DayO';
  return local.replace(/[._-]+/g, ' ').trim() || 'DayO';
}

function displayNameFromUser(user) {
  if (!user) return 'DayO';
  var meta = user.user_metadata || {};
  return String(
    meta.user_name || meta.full_name || meta.name || nameFromEmail(user.email)
  ).trim() || 'DayO';
}

function dispatchAuthChange(loggedIn, extra) {
  extra = extra || {};
  document.dispatchEvent(new CustomEvent('dayo:authchange', {
    detail: Object.assign({
      loggedIn: !!loggedIn,
      userName: extra.userName || lsGet(USER_KEY, ''),
      userId: extra.userId || getAuthUserId() || '',
      email: extra.email || lsGet(EMAIL_KEY, '')
    }, extra)
  }));
}

function clearAuthLocal() {
  authUser = null;
  try {
    window.localStorage.removeItem(USER_KEY);
    window.localStorage.removeItem(EMAIL_KEY);
    window.localStorage.removeItem(MEMBER_KEY);
    window.localStorage.removeItem(AUTH_ID_KEY);
  } catch (e) { /* ignore */ }
}

function parseVocab(raw) {
  if (Array.isArray(raw)) return raw.filter(function (row) { return row && row.word; });
  if (typeof raw === 'string' && raw) {
    try {
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parseVocab(parsed) : [];
    } catch (e) {
      return [];
    }
  }
  return [];
}

function mergeVocabLists(a, b) {
  var out = [];
  parseVocab(a).concat(parseVocab(b)).forEach(function (item) {
    if (!out.some(function (row) { return row.word === item.word; })) {
      out.push({
        word: String(item.word),
        meaning: item.meaning ? String(item.meaning) : '',
        kind: item.kind ? String(item.kind) : 'word',
        savedAt: item.savedAt || new Date().toISOString()
      });
    }
  });
  return out;
}

function getJamCount() {
  var remote = profileCache && profileCache.jam_count;
  var remoteN = Number(remote);
  var localN = parseInt(lsGet(JAM_KEY, '0'), 10);
  var local = Number.isFinite(localN) ? localN : 0;
  if (Number.isFinite(remoteN)) return Math.max(remoteN, local);
  return local;
}

function getVocab() {
  var remote = profileCache && profileCache.review_vocab;
  return mergeVocabLists(lsGet(VOCAB_KEY, '[]'), remote);
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
    preferred_request: lsGet(REQUEST_KEY, 'praise') || 'praise',
    jam_count: getJamCount(),
    review_vocab: getVocab()
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
  if (profile.jam_count != null) {
    var jam = Math.max(Number(profile.jam_count) || 0, parseInt(lsGet(JAM_KEY, '0'), 10) || 0);
    lsSet(JAM_KEY, jam);
    profile.jam_count = jam;
  }
  if (profile.review_vocab != null) {
    var vocab = mergeVocabLists(lsGet(VOCAB_KEY, '[]'), profile.review_vocab);
    lsSet(VOCAB_KEY, JSON.stringify(vocab));
    profile.review_vocab = vocab;
  }

  if (window.DayOTicketWallet && typeof window.DayOTicketWallet.syncUI === 'function') {
    window.DayOTicketWallet.syncUI(Number(profile.ticket_count));
  }
  syncRewardUI();
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

    var insertPayload = {
      client_key: local.client_key,
      user_id: getAuthUserId() || null,
      user_name: local.user_name || '',
      email: local.email || '',
      ticket_count: local.ticket_count || 1,
      streak_count: local.streak_count,
      last_login_date: local.last_login_date || '',
      speech_speed: local.speech_speed,
      preferred_style: local.preferred_style,
      preferred_request: local.preferred_request,
      updated_at: new Date().toISOString()
    };
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
  if (profile.jam_count != null) lsSet(JAM_KEY, Number(profile.jam_count) || 0);
  if (profile.review_vocab != null) lsSet(VOCAB_KEY, JSON.stringify(parseVocab(profile.review_vocab)));
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
      user_id: next.user_id || getAuthUserId() || null,
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
    var withRewards = Object.assign({}, payload, {
      jam_count: Number(next.jam_count) || 0,
      review_vocab: parseVocab(next.review_vocab)
    });

    var result = await client
      .from('profiles')
      .upsert(withRewards, { onConflict: 'client_key' })
      .select('*')
      .single();

    if (result.error) {
      result = await client
        .from('profiles')
        .upsert(payload, { onConflict: 'client_key' })
        .select('*')
        .single();
    }
    if (result.error) {
      var noUserCol = Object.assign({}, payload);
      delete noUserCol.user_id;
      result = await client
        .from('profiles')
        .upsert(noUserCol, { onConflict: 'client_key' })
        .select('*')
        .single();
    }

    if (result.error) throw result.error;
    profileCache = Object.assign({}, result.data, {
      jam_count: withRewards.jam_count,
      review_vocab: withRewards.review_vocab
    });
    return profileCache;
  } catch (err) {
    console.warn('[DayO] profiles update failed — localStorage kept', err);
    return next;
  }
}

async function ensureProfileForUser(user) {
  if (!user) return fetchOrCreateProfile();

  authUser = user;
  var userId = user.id;
  var email = String(user.email || '').trim().toLowerCase();
  var name = displayNameFromUser(user);
  var today = new Date().toISOString().slice(0, 10);

  lsSet(AUTH_ID_KEY, userId);
  lsSet(USER_KEY, name);
  lsSet(EMAIL_KEY, email);
  lsSet(MEMBER_KEY, 'active');
  lsSet(PROFILE_KEY, 'user:' + userId);

  var client = getClient();
  var local = defaultsFromLocal();
  if (!client) {
    profileCache = Object.assign({ id: null, user_id: userId, _offline: true }, local, {
      user_name: name,
      email: email,
      ticket_count: 1
    });
    applyProfileToLocal(profileCache);
    return profileCache;
  }

  try {
    var byId = await client.from('profiles').select('*').eq('user_id', userId).maybeSingle();
    if (byId.error) throw byId.error;
    if (byId.data) {
      var nextLogin = Object.assign({}, byId.data, {
        user_name: byId.data.user_name || name,
        email: byId.data.email || email,
        last_login_date: today
      });
      profileCache = nextLogin;
      applyProfileToLocal(profileCache);
      if (!byId.data.user_name || !byId.data.last_login_date) {
        await client.from('profiles').update({
          user_name: nextLogin.user_name,
          email: nextLogin.email,
          last_login_date: today,
          updated_at: new Date().toISOString()
        }).eq('id', byId.data.id);
      }
      return profileCache;
    }

    if (email) {
      var byEmail = await client.from('profiles').select('*').eq('email', email).maybeSingle();
      if (byEmail.data) {
        var patched = await client.from('profiles').update({
          user_id: userId,
          client_key: 'user:' + userId,
          user_name: byEmail.data.user_name || name,
          last_login_date: today,
          updated_at: new Date().toISOString()
        }).eq('id', byEmail.data.id).select('*').single();
        profileCache = patched.data || Object.assign({}, byEmail.data, { user_id: userId });
        applyProfileToLocal(profileCache);
        return profileCache;
      }
    }

    var insertPayload = {
      user_id: userId,
      client_key: 'user:' + userId,
      user_name: name,
      email: email,
      ticket_count: 1,
      streak_count: 1,
      last_login_date: today,
      speech_speed: local.speech_speed,
      preferred_style: local.preferred_style,
      preferred_request: local.preferred_request,
      updated_at: new Date().toISOString()
    };
    var inserted = await client.from('profiles').insert(insertPayload).select('*').single();
    if (inserted.error) {
      var again = await client.from('profiles').select('*').eq('user_id', userId).maybeSingle();
      if (again.data) {
        profileCache = again.data;
        applyProfileToLocal(profileCache);
        return profileCache;
      }
      throw inserted.error;
    }
    profileCache = inserted.data;
    applyProfileToLocal(profileCache);
    return profileCache;
  } catch (err) {
    console.warn('[DayO] ensureProfileForUser failed — using local fallback', err);
    profileCache = Object.assign({ id: null, user_id: userId, _offline: true }, local, {
      user_name: name,
      email: email,
      ticket_count: Number(local.ticket_count) > 0 ? local.ticket_count : 1
    });
    applyProfileToLocal(profileCache);
    return profileCache;
  }
}

function bindAuthListener(client) {
  if (authBound || !client || !client.auth) return;
  authBound = true;
  client.auth.onAuthStateChange(function (event, session) {
    var user = session && session.user ? session.user : null;
    if (user) {
      authUser = user;
      lsSet(AUTH_ID_KEY, user.id);
      if (event === 'TOKEN_REFRESHED') return;
      ensureProfileForUser(user).then(function (profile) {
        dispatchAuthChange(true, {
          userName: (profile && profile.user_name) || displayNameFromUser(user),
          userId: user.id,
          email: user.email || '',
          event: event
        });
      }).catch(function () {
        dispatchAuthChange(true, {
          userName: displayNameFromUser(user),
          userId: user.id,
          email: user.email || '',
          event: event
        });
      });
      return;
    }
    if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
      clearAuthLocal();
      profileCache = null;
      dispatchAuthChange(false, { userName: '', userId: '', email: '', event: event });
      return;
    }
    if (event === 'INITIAL_SESSION' && !authUser) {
      clearAuthLocal();
      dispatchAuthChange(false, { userName: '', userId: '', email: '', event: event });
    }
  });
}

function authError(code, message) {
  var err = new Error(message || code);
  err.code = code;
  err.userMessage = message || '';
  return err;
}

function isMissingUserError(error) {
  var msg = String((error && (error.message || error.error_description || error.msg)) || '').toLowerCase();
  var status = Number(error && (error.status || error.statusCode)) || 0;
  if (/invalid login credentials|invalid credentials|user not found|email not found|unable to find user|no user found/i.test(msg)) {
    return true;
  }
  return status === 400 && /invalid login/i.test(msg);
}

function classifyAuthError(error) {
  var msg = String((error && (error.message || error.error_description || error.msg)) || '').trim();
  var lower = msg.toLowerCase();
  if (/at least 6|minimum 6|6 characters|password.*short|weak password/i.test(lower)) {
    return authError('password_length', msg);
  }
  if (/already registered|already exists|user already/i.test(lower)) {
    return authError('password', msg);
  }
  if (/invalid login credentials|invalid credentials|wrong password|incorrect password/i.test(lower)) {
    return authError('password', msg);
  }
  if (/email not confirmed|not confirmed/i.test(lower)) {
    return authError('confirm_email', msg);
  }
  if (/invalid.*email|email.*invalid|valid email/i.test(lower)) {
    return authError('invalid_email', msg);
  }
  if (/rate limit|too many requests|only request this after/i.test(lower)) {
    return authError('rate_limit', msg);
  }
  return authError('auth', msg);
}

async function signInWithEmail(email, password) {
  var client = getClient();
  var cleanedEmail = String(email || '').trim().toLowerCase();
  var cleanedPass = String(password || '');
  if (!client) throw authError('auth', 'supabase unavailable');
  if (!cleanedEmail || !cleanedPass) throw authError('missing', '');
  if (cleanedPass.length < 6) throw authError('password_length', '');

  var signedIn = await client.auth.signInWithPassword({
    email: cleanedEmail,
    password: cleanedPass
  });

  if (!signedIn.error && signedIn.data && signedIn.data.session) {
    var profile = await ensureProfileForUser(signedIn.data.user);
    return {
      isNew: false,
      needsEmail: false,
      user: signedIn.data.user,
      profile: profile,
      name: (profile && profile.user_name) || displayNameFromUser(signedIn.data.user),
      email: cleanedEmail
    };
  }

  if (signedIn.error && !isMissingUserError(signedIn.error)) {
    throw classifyAuthError(signedIn.error);
  }

  var signedUp = await client.auth.signUp({
    email: cleanedEmail,
    password: cleanedPass,
    options: {
      data: { user_name: nameFromEmail(cleanedEmail) },
      emailRedirectTo: window.location.origin + (window.location.pathname || '/')
    }
  });

  if (signedUp.error) {
    var classified = classifyAuthError(signedUp.error);
    if (classified.code === 'password' || /already registered|already exists/i.test(String(signedUp.error.message || ''))) {
      throw authError('password', signedUp.error.message);
    }
    throw classified;
  }

  var signupUser = signedUp.data && signedUp.data.user;
  var identities = signupUser && signupUser.identities;
  if (signupUser && !signedUp.data.session && Array.isArray(identities) && identities.length === 0) {
    throw authError('password', '');
  }

  if (signedUp.data && signedUp.data.session && signupUser) {
    var created = await ensureProfileForUser(signedUp.data.user);
    return {
      isNew: true,
      needsEmail: false,
      user: signedUp.data.user,
      profile: created,
      name: (created && created.user_name) || nameFromEmail(cleanedEmail),
      email: cleanedEmail
    };
  }

  return {
    isNew: true,
    needsEmail: true,
    user: signedUp.data && signedUp.data.user,
    profile: null,
    name: nameFromEmail(cleanedEmail),
    email: cleanedEmail
  };
}

async function signInWithGoogle() {
  var client = getClient();
  if (!client) throw new Error('supabase unavailable');
  var redirectTo = window.location.href.split('#')[0];
  var result = await client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: redirectTo }
  });
  if (result.error) throw result.error;
  return result.data;
}

async function signOutAuth() {
  var client = getClient();
  try {
    if (client && client.auth) await client.auth.signOut();
  } catch (e) {
    console.warn('[DayO] signOut failed', e);
  }
  clearAuthLocal();
  profileCache = null;
  dispatchAuthChange(false, { userName: '', userId: '', email: '' });
}

/** After login: rebind client_key to auth user / email and load/create that profile row */
async function rebindIdentity(name, email) {
  if (name) lsSet(USER_KEY, name);
  if (email) lsSet(EMAIL_KEY, email);
  if (authUser) return ensureProfileForUser(authUser);
  var key = getClientKey();
  readyPromise = null;
  profileCache = null;
  var profile = await fetchOrCreateProfile();
  return updateProfile({
    client_key: key,
    user_id: getAuthUserId() || profile.user_id || null,
    user_name: name || profile.user_name || '',
    email: email || profile.email || ''
  }, { skipEvents: false });
}

function getProfile() {
  return profileCache || defaultsFromLocal();
}

function syncRewardUI() {
  var jam = getJamCount();
  Array.prototype.forEach.call(document.querySelectorAll('[data-jam-count]'), function (el) {
    el.textContent = String(jam);
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-jam-count-text]'), function (el) {
    el.textContent = jam + ' Jam';
  });

  var items = getVocab();
  Array.prototype.forEach.call(document.querySelectorAll('[data-review-vocab]'), function (list) {
    list.innerHTML = items.map(function (item) {
      var meaning = item.meaning ? escapeHtml(item.meaning) : '';
      return '<li class="vocab-item">' +
        '<span class="vocab-item__word">' + escapeHtml(item.word) + '</span>' +
        (meaning ? '<span class="vocab-item__meaning">' + meaning + '</span>' : '') +
        '</li>';
    }).join('');
    list.hidden = items.length === 0;
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-review-vocab-empty]'), function (el) {
    el.hidden = items.length > 0;
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function addJam(amount) {
  var add = Math.max(0, Math.floor(Number(amount) || 0));
  var next = getJamCount() + add;
  lsSet(JAM_KEY, next);
  return updateProfile({ jam_count: next }).then(function (profile) {
    document.dispatchEvent(new CustomEvent('dayo:jamchange', {
      detail: { jamCount: next, added: add }
    }));
    syncRewardUI();
    return { jamCount: next, added: add, profile: profile };
  });
}

function mergeVocab(items) {
  var next = mergeVocabLists(getVocab(), items || []);
  lsSet(VOCAB_KEY, JSON.stringify(next));
  return updateProfile({ review_vocab: next }).then(function (profile) {
    document.dispatchEvent(new CustomEvent('dayo:vocabchange', {
      detail: { vocab: next }
    }));
    syncRewardUI();
    return next;
  });
}

var LAST_TRANSCRIPT_KEY = 'last_session_transcript';

function serializeTranscript(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(function (row, i) {
    var ts = row && row.timestamp;
    if (ts instanceof Date) ts = ts.toISOString();
    else if (ts == null) ts = new Date().toISOString();
    return {
      id: (row && row.id) || ('t-' + i),
      speaker: (row && row.speaker) || 'user',
      text: String((row && row.text) || '').trim(),
      timestamp: ts
    };
  }).filter(function (row) { return row.text; });
}

function backupTranscriptLocal(rows) {
  var serialized = serializeTranscript(rows);
  try {
    window.localStorage.setItem(LAST_TRANSCRIPT_KEY, JSON.stringify(serialized));
  } catch (e) { /* quota / private mode */ }
  return serialized;
}

function getLastTranscript() {
  try {
    var parsed = JSON.parse(lsGet(LAST_TRANSCRIPT_KEY, '[]'));
    return Array.isArray(parsed) ? serializeTranscript(parsed) : [];
  } catch (e) {
    return [];
  }
}

async function saveSessionLog(transcript, extra) {
  extra = extra || {};
  var serialized = backupTranscriptLocal(transcript);
  var payload = {
    client_key: getClientKey(),
    user_id: extra.userId || getAuthUserId() || null,
    user_name: lsGet(USER_KEY, ''),
    email: lsGet(EMAIL_KEY, ''),
    room_name: extra.roomName || '',
    transcript: serialized,
    started_at: extra.startedAt || (serialized[0] && serialized[0].timestamp) || new Date().toISOString(),
    ended_at: extra.endedAt || new Date().toISOString()
  };

  var client = getClient();
  if (!client) {
    return { ok: false, local: true, transcript: serialized, payload: payload };
  }

  try {
    var result = await client.from('session_logs').insert(payload).select('id').single();
    if (result.error) {
      var withoutUser = Object.assign({}, payload);
      delete withoutUser.user_id;
      result = await client.from('session_logs').insert(withoutUser).select('id').single();
    }
    if (result.error) {
      result = await client.from('transcripts').insert(payload).select('id').single();
    }
    if (result.error) throw result.error;
    return {
      ok: true,
      local: true,
      id: result.data && result.data.id,
      transcript: serialized,
      payload: payload
    };
  } catch (err) {
    console.warn('[DayO] session_logs insert failed — localStorage kept', err);
    return { ok: false, local: true, transcript: serialized, payload: payload, error: err };
  }
}

function getUser() {
  return authUser;
}

function getUserId() {
  return getAuthUserId() || '';
}

function isSignedIn() {
  return !!getAuthUserId();
}

async function bootstrap() {
  var client = getClient();
  bindAuthListener(client);
  if (!client) return fetchOrCreateProfile();
  try {
    var sessionRes = await client.auth.getSession();
    var session = sessionRes && sessionRes.data && sessionRes.data.session;
    if (session && session.user) {
      return ensureProfileForUser(session.user);
    }
  } catch (e) {
    console.warn('[DayO] getSession failed', e);
  }
  return fetchOrCreateProfile();
}

function ready() {
  if (!readyPromise) readyPromise = bootstrap();
  return readyPromise;
}

window.DayOProfileStore = {
  ready: ready,
  getProfile: getProfile,
  updateProfile: updateProfile,
  fetchOrCreateProfile: fetchOrCreateProfile,
  ensureProfileForUser: ensureProfileForUser,
  rebindIdentity: rebindIdentity,
  getClient: getClient,
  getClientKey: getClientKey,
  getUser: getUser,
  getUserId: getUserId,
  isSignedIn: isSignedIn,
  signInWithEmail: signInWithEmail,
  signInWithGoogle: signInWithGoogle,
  signOut: signOutAuth,
  getJamCount: getJamCount,
  getVocab: getVocab,
  addJam: addJam,
  mergeVocab: mergeVocab,
  saveSessionLog: saveSessionLog,
  getLastTranscript: getLastTranscript,
  syncRewardUI: syncRewardUI
};

ready().then(function () {
  syncRewardUI();
}).catch(function (e) {
  console.warn('[DayO] profile bootstrap error', e);
  syncRewardUI();
});
