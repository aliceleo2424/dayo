/**
 * DayO Supabase client (shared)
 * - Next.js / Node: reads NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY
 * - Browser: falls back to window.__DAYO_ENV__ (see supabase-env.js)
 */
import { createClient } from '@supabase/supabase-js';

function readEnv(name) {
  if (typeof process !== 'undefined' && process.env && process.env[name]) {
    return String(process.env[name]).trim();
  }
  if (typeof window !== 'undefined' && window.__DAYO_ENV__ && window.__DAYO_ENV__[name]) {
    return String(window.__DAYO_ENV__[name]).trim();
  }
  return '';
}

/** createClient expects project root URL (no /rest/v1 suffix) */
export function normalizeSupabaseUrl(url) {
  return String(url || '')
    .trim()
    .replace(/\/rest\/v1\/?$/i, '')
    .replace(/\/+$/, '');
}

export function getSupabaseConfig() {
  const url = normalizeSupabaseUrl(readEnv('NEXT_PUBLIC_SUPABASE_URL'));
  const anonKey = readEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return { url, anonKey };
}

const { url, anonKey } = getSupabaseConfig();

if (!url || !anonKey) {
  console.warn('[DayO] Supabase env missing: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

export const supabase = createClient(url || 'https://placeholder.supabase.co', anonKey || 'placeholder', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

export default supabase;
